import { eq } from "drizzle-orm";
import { nid, nowISO } from "@/lib/datetime";
import { backfillTxsForBooking, groupSalesForBackfill } from "@/lib/sales";
import type { AppDb } from "./index";
import * as t from "./schema";

export const BOOKING_TX_BACKFILL_FLAG = "booking_tx_backfill_v1";

export async function backfillBookingTransactions(db: AppDb) {
  const existing = (await db.select().from(t.appSettings).where(eq(t.appSettings.key, BOOKING_TX_BACKFILL_FLAG)).limit(1))[0];
  if (existing?.value === "done") return;
  const [sales, already] = await Promise.all([
    db.select().from(t.roomSales),
    db.select({ bookingId: t.bookingTransactions.bookingId }).from(t.bookingTransactions),
  ]);
  const skipped = new Set(already.map((row) => row.bookingId));
  const now = nowISO();
  const rows = [];
  for (const [bookingId, rooms] of groupSalesForBackfill(sales)) {
    if (skipped.has(bookingId)) continue;
    for (const tx of backfillTxsForBooking(rooms)) {
      rows.push({
        id: nid(),
        bookingId,
        kind: tx.kind,
        amount: tx.amount,
        method: tx.method,
        paidAt: tx.paidAt,
        paidOn: tx.paidOn,
        note: tx.note,
        photo: tx.photo,
        createdAt: now,
        createdBy: tx.createdBy,
      });
    }
  }
  // D1 allows 100 bound parameters per statement; 11 columns → max 8 rows.
  for (let index = 0; index < rows.length; index += 8) {
    await db.insert(t.bookingTransactions).values(rows.slice(index, index + 8));
  }
  if (!existing) {
    try {
      await db.insert(t.appSettings).values({ key: BOOKING_TX_BACKFILL_FLAG, value: "done", updatedAt: now, updatedBy: null });
    } catch {
      await db.update(t.appSettings).set({ value: "done", updatedAt: now }).where(eq(t.appSettings.key, BOOKING_TX_BACKFILL_FLAG));
    }
    return;
  }
  await db.update(t.appSettings).set({ value: "done", updatedAt: now }).where(eq(t.appSettings.key, BOOKING_TX_BACKFILL_FLAG));
}