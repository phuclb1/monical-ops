import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { addMinutes, nid, nowISO, todayVN } from "../../datetime";
import { isSaleOrigin, parseSaleSource, saleStatusToStay } from "../../sales";

export async function syncStayFromSale(
  actorId: string,
  sale: {
    origin: string;
    source: string;
    pmsCode: string | null;
    roomId: string;
    guestName: string;
    guestPhone: string | null;
    status: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    breakfast?: boolean;
    notes: string | null;
  },
  previousRoomId?: string,
) {
  const pmsCode = sale.pmsCode?.trim();
  if (!pmsCode) return;
  const db = await getDb();
  const now = nowISO();
  const stayStatus = saleStatusToStay(sale.status, { checkOut: sale.checkOut, date: todayVN() });
  const matches = await db.select().from(t.stays).where(eq(t.stays.pmsCode, pmsCode));
  const existing =
    matches.find((row) => row.roomId === sale.roomId) ??
    (previousRoomId ? matches.find((row) => row.roomId === previousRoomId) : undefined) ??
    matches.find((row) => !row.roomId);
  const origin = isSaleOrigin(sale.origin) ? sale.origin : existing?.origin === "ezcloud" ? "ezcloud" : "ops";
  const payload = {
    pmsCode,
    origin,
    source: parseSaleSource(sale.source),
    roomId: sale.roomId,
    guestName: sale.guestName,
    guestPhone: sale.guestPhone,
    status: stayStatus,
    arrivalDate: sale.checkIn,
    departureDate: sale.checkOut,
    adults: sale.adults,
    children: sale.children,
    breakfast: sale.breakfast !== false,
    notes: sale.notes || existing?.notes || null,
    updatedAt: now,
    updatedBy: actorId,
  };
  if (existing) {
    await db.update(t.stays).set({
      ...payload,
      pmsBookingOk: existing.pmsBookingOk || origin === "ops",
    }).where(eq(t.stays.id, existing.id));
    return;
  }
  const id = `s-${pmsCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${nid().slice(0, 8)}`;
  await db.insert(t.stays).values({
    id,
    ...payload,
    breakfast: sale.breakfast !== false,
    pmsBookingOk: true,
    pmsCheckinOk: stayStatus === "inhouse" || stayStatus === "departed",
    pmsCheckoutOk: stayStatus === "departed",
    invoiceOk: false,
    paymentNote: null,
    checkinAt: stayStatus === "inhouse" || stayStatus === "departed" ? now : null,
    registrationDueAt: stayStatus === "inhouse" ? addMinutes(now, 30) : null,
    registrationDoneAt: null,
    registrationReason: null,
    createdAt: now,
    createdBy: actorId,
  });
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
      .set({ opsStatus: "vacant_dirty", hkStatus: "waiting", updatedAt: now, updatedBy: actorId })
      .where(eq(t.rooms.id, room.id));
  }
}
