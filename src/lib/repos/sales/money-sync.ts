import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO } from "../../datetime";
import { computeBookingMoney } from "../../sales";

export async function syncBookingMoney(bookingId: string) {
  const id = String(bookingId || "").trim();
  if (!id) return;
  const db = await getDb();
  const rooms = await db.select().from(t.roomSales).where(or(eq(t.roomSales.bookingId, id), eq(t.roomSales.id, id)));
  if (!rooms.length) return;
  const extras = await db.select().from(t.saleExtras).where(eq(t.saleExtras.bookingId, id));
  const money = computeBookingMoney(rooms, extras);
  const now = nowISO();
  const patch = {
    bookingTotal: money.total,
    deposit: money.deposit,
    checkinPaid: money.checkinPaid,
    refundTotal: money.refunded,
    updatedAt: now,
  };
  await db.update(t.roomSales).set(patch).where(or(eq(t.roomSales.bookingId, id), eq(t.roomSales.id, id)));
  return money;
}
