import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { addMinutes, nid, nowISO } from "../../datetime";
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
  const stayStatus = saleStatusToStay(sale.status);
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
