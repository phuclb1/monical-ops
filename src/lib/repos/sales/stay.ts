import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO } from "../../datetime";

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
