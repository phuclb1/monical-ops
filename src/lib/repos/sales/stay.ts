import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO } from "../../datetime";
import { ACTIVE_SALE_STATUSES } from "../../types";

const OPEN_STAY_STATUSES = ["arriving", "inhouse", "departing"] as const;

/** Checked-in booking moved rooms: the old room must not stay held. */
export async function followStayRoom(
  actorId: string,
  move: { pmsCode: string | null; fromRoomId: string; toRoomId: string },
) {
  const code = move.pmsCode?.trim() || "";
  if (!code || move.fromRoomId === move.toRoomId) return;
  const db = await getDb();
  const stillThere = await db
    .select({ id: t.roomSales.id })
    .from(t.roomSales)
    .where(
      and(
        eq(t.roomSales.roomId, move.fromRoomId),
        eq(t.roomSales.pmsCode, code),
        inArray(t.roomSales.status, [...ACTIVE_SALE_STATUSES]),
      ),
    )
    .limit(1);
  if (stillThere.length) return;
  const openOn = and(
    eq(t.stays.pmsCode, code),
    inArray(t.stays.status, [...OPEN_STAY_STATUSES]),
  );
  const alreadyOnNext = await db
    .select({ id: t.stays.id })
    .from(t.stays)
    .where(and(openOn, eq(t.stays.roomId, move.toRoomId)))
    .limit(1);
  const now = nowISO();
  if (alreadyOnNext.length) {
    await db
      .update(t.stays)
      .set({ status: "departed", updatedAt: now, updatedBy: actorId })
      .where(and(openOn, eq(t.stays.roomId, move.fromRoomId)));
    return;
  }
  await db
    .update(t.stays)
    .set({ roomId: move.toRoomId, updatedAt: now, updatedBy: actorId })
    .where(and(openOn, eq(t.stays.roomId, move.fromRoomId)));
}

export async function applySaleRoomState(
  actorId: string,
  sale: { roomId: string; status: string },
) {
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, sale.roomId)).limit(1))[0];
  if (!room || room.opsStatus === "ooo") return;
  const now = nowISO();
  if (sale.status === "inhouse") {
    if (room.opsStatus !== "occupied") {
      await db
        .update(t.rooms)
        .set({ opsStatus: "occupied", updatedAt: now, updatedBy: actorId })
        .where(eq(t.rooms.id, room.id));
    }
    return;
  }
  if (sale.status === "departed") {
    await db
      .update(t.rooms)
      .set({ opsStatus: "vacant_clean", hkStatus: "ins", updatedAt: now, updatedBy: actorId })
      .where(eq(t.rooms.id, room.id));
  }
}
