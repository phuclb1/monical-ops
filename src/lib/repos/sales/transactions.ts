import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO, paidOnVN, parseDatetimeLocalVN } from "../../datetime";
import { bookingDisplayCode, bookingKey, isPaymentMethod, parsePaymentMethod, parsePhotoData, type BookingTxKind } from "../../sales";
import type { PaymentMethod, SessionUser } from "../../types";

export type BookingTransactionRow = typeof t.bookingTransactions.$inferSelect;

export async function listBookingTransactions(bookingIds: string[]) {
  const ids = [...new Set(bookingIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];
  const db = await getDb();
  const rows: BookingTransactionRow[] = [];
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    rows.push(...(await db.select().from(t.bookingTransactions).where(inArray(t.bookingTransactions.bookingId, chunk))));
  }
  return rows.sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function insertBookingTransaction(
  user: SessionUser,
  bookingId: string,
  data: {
    kind: BookingTxKind;
    amount: number;
    method?: string | PaymentMethod;
    paidAt?: string | null;
    note?: string | null;
    photo?: string | null;
  },
) {
  const amount = Math.max(0, Math.round(data.amount || 0));
  if (!amount) throw new Error("Nhập số tiền");
  const method = isPaymentMethod(String(data.method || "")) ? data.method as PaymentMethod : parsePaymentMethod(data.method);
  const paidAt = data.paidAt?.includes("T") && data.paidAt.length <= 16 ? parseDatetimeLocalVN(data.paidAt) : data.paidAt || nowISO();
  const now = nowISO();
  const row = {
    id: nid(),
    bookingId,
    kind: data.kind,
    amount,
    method,
    paidAt,
    paidOn: paidOnVN(paidAt),
    note: String(data.note || "").trim(),
    photo: parsePhotoData(data.photo),
    createdAt: now,
    createdBy: user.id,
  };
  const db = await getDb();
  await db.insert(t.bookingTransactions).values(row);
  return row;
}

export type LedgerEntry = {
  id: string;
  bookingId: string;
  guestName: string;
  bookingCode: string;
  rooms: string;
  kind: string;
  amount: number;
  signedAmount: number;
  method: string;
  paidAt: string;
  paidOn: string;
  note: string;
  photo: string | null;
};

export async function listLedger(from: string, toExclusive: string) {
  const db = await getDb();
  const txs = await db
    .select()
    .from(t.bookingTransactions)
    .where(and(gte(t.bookingTransactions.paidOn, from), lt(t.bookingTransactions.paidOn, toExclusive)))
    .orderBy(desc(t.bookingTransactions.paidAt), desc(t.bookingTransactions.id));
  if (!txs.length) return [] as LedgerEntry[];
  const ids = [...new Set(txs.map((row) => row.bookingId))];
  const sales: (typeof t.roomSales.$inferSelect)[] = [];
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    sales.push(
      ...(await db
        .select()
        .from(t.roomSales)
        .where(or(inArray(t.roomSales.bookingId, chunk), inArray(t.roomSales.id, chunk)))),
    );
  }
  const rooms = await db.select({ id: t.rooms.id, number: t.rooms.number }).from(t.rooms);
  const numberById = new Map(rooms.map((row) => [row.id, row.number]));
  const byBooking = new Map<string, (typeof sales)[number][]>();
  for (const sale of sales) {
    const key = bookingKey(sale);
    const list = byBooking.get(key) || [];
    list.push(sale);
    byBooking.set(key, list);
  }
  return txs.map((tx) => {
    const group = byBooking.get(tx.bookingId) || [];
    const head = [...group].sort((a, b) => (b.deposit || 0) - (a.deposit || 0) || a.createdAt.localeCompare(b.createdAt))[0];
    const roomLabel = group
      .map((row) => numberById.get(row.roomId) || row.roomId)
      .filter(Boolean)
      .join(", ");
    const amount = Math.max(0, Math.round(tx.amount || 0));
    return {
      id: tx.id,
      bookingId: tx.bookingId,
      guestName: head?.guestName || "—",
      bookingCode: head ? bookingDisplayCode(head) : tx.bookingId,
      rooms: roomLabel,
      kind: tx.kind,
      amount,
      signedAmount: tx.kind === "refund" ? -amount : amount,
      method: tx.method,
      paidAt: tx.paidAt,
      paidOn: tx.paidOn,
      note: tx.note || "",
      photo: tx.photo,
    };
  });
}

export async function bookingHasTransactions(bookingId: string) {
  const db = await getDb();
  const row = (
    await db.select({ id: t.bookingTransactions.id }).from(t.bookingTransactions).where(eq(t.bookingTransactions.bookingId, bookingId)).limit(1)
  )[0];
  return Boolean(row);
}