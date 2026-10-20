import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO } from "../../datetime";
import { computeBookingMoney, projectBookingPaid } from "../../sales";

export async function syncBookingMoney(bookingId: string) {
  const id = String(bookingId || "").trim();
  if (!id) return;
  const db = await getDb();
  const rooms = await db.select().from(t.roomSales).where(or(eq(t.roomSales.bookingId, id), eq(t.roomSales.id, id)));
  if (!rooms.length) return;
  const [extras, txs] = await Promise.all([
    db.select().from(t.saleExtras).where(eq(t.saleExtras.bookingId, id)),
    db.select().from(t.bookingTransactions).where(eq(t.bookingTransactions.bookingId, id)),
  ]);
  const money = computeBookingMoney(rooms, extras);
  const paid = txs.length ? projectBookingPaid(txs) : null;
  const now = nowISO();
  const patch = {
    bookingTotal: money.total,
    deposit: paid ? paid.deposit : money.deposit,
    checkinPaid: paid ? paid.checkinPaid : money.checkinPaid,
    cashPaid: paid ? paid.cashPaid : rooms[0].cashPaid,
    transferPaid: paid ? paid.transferPaid : rooms[0].transferPaid,
    companyPaid: paid ? paid.companyPaid : rooms[0].companyPaid,
    refundCash: paid ? paid.refundCash : rooms[0].refundCash,
    refundTransfer: paid ? paid.refundTransfer : rooms[0].refundTransfer,
    refundCompany: paid ? paid.refundCompany : rooms[0].refundCompany,
    refundTotal: paid ? paid.refundTotal : money.refunded,
    refundedAt: paid ? paid.refundedAt : rooms.map((row) => row.refundedAt).filter(Boolean).sort()[0] || null,
    checkinMethod: paid ? paid.checkinMethod : rooms[0].checkinMethod,
    updatedAt: now,
  };
  await db.update(t.roomSales).set(patch).where(or(eq(t.roomSales.bookingId, id), eq(t.roomSales.id, id)));
  return { ...money, ...patch };
}