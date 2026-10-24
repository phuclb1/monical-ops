import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { pageBounds } from "@/lib/booking-desk";
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

function ledgerSigned(kind: string, amount: number) {
  return kind === "refund" ? -amount : amount;
}

function toLedgerEntry(
  tx: BookingTransactionRow,
  group: (typeof t.roomSales.$inferSelect)[],
  numberById: Map<string, string>,
): LedgerEntry {
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
    signedAmount: ledgerSigned(tx.kind, amount),
    method: tx.method,
    paidAt: tx.paidAt,
    paidOn: tx.paidOn,
    note: tx.note || "",
    photo: tx.photo,
  };
}

async function salesHeadsByBookingIds(ids: string[]) {
  if (!ids.length) return { byBooking: new Map<string, (typeof t.roomSales.$inferSelect)[]>(), numberById: new Map<string, string>() };
  const db = await getDb();
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
  return { byBooking, numberById };
}

function ledgerTotalsOf(rows: { kind: string; amount: number; method: string; signedAmount: number }[]) {
  return {
    inflow: rows.filter((row) => row.kind !== "refund").reduce((sum, row) => sum + row.amount, 0),
    refund: rows.filter((row) => row.kind === "refund").reduce((sum, row) => sum + row.amount, 0),
    cash: rows.filter((row) => row.method === "cash").reduce((sum, row) => sum + row.signedAmount, 0),
    transfer: rows.filter((row) => row.method === "personal").reduce((sum, row) => sum + row.signedAmount, 0),
    company: rows.filter((row) => row.method === "company").reduce((sum, row) => sum + row.signedAmount, 0),
  };
}

function txMoney(tx: BookingTransactionRow) {
  const amount = Math.max(0, Math.round(tx.amount || 0));
  return { kind: tx.kind, amount, method: tx.method, signedAmount: ledgerSigned(tx.kind, amount) };
}

function matchesLedgerSearch(row: LedgerEntry, q: string) {
  if (!q) return true;
  const hay = `${row.guestName} ${row.bookingCode} ${row.bookingId} ${row.note} ${row.rooms}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

export async function listLedgerPage(input: {
  from: string;
  toExclusive: string;
  q?: string;
  kind?: string;
  method?: string;
  page: number;
  pageSize: number;
}) {
  const db = await getDb();
  const q = input.q?.trim() || "";
  const kind = input.kind || "";
  const method = input.method || "";
  const clauses = [gte(t.bookingTransactions.paidOn, input.from), lt(t.bookingTransactions.paidOn, input.toExclusive)];
  if (kind) clauses.push(eq(t.bookingTransactions.kind, kind));
  if (method) clauses.push(eq(t.bookingTransactions.method, method));
  const txs = await db
    .select()
    .from(t.bookingTransactions)
    .where(and(...clauses))
    .orderBy(desc(t.bookingTransactions.paidAt), desc(t.bookingTransactions.id));
  if (!txs.length) {
    return {
      rows: [] as LedgerEntry[],
      totals: ledgerTotalsOf([]),
      total: 0,
      bounds: pageBounds(0, input.page, input.pageSize),
    };
  }
  if (!q) {
    const bounds = pageBounds(txs.length, input.page, input.pageSize);
    const pageTxs = txs.slice(bounds.start, bounds.start + bounds.take);
    const { byBooking, numberById } = await salesHeadsByBookingIds([...new Set(pageTxs.map((row) => row.bookingId))]);
    return {
      rows: pageTxs.map((tx) => toLedgerEntry(tx, byBooking.get(tx.bookingId) || [], numberById)),
      totals: ledgerTotalsOf(txs.map(txMoney)),
      total: txs.length,
      bounds,
    };
  }
  const { byBooking, numberById } = await salesHeadsByBookingIds([...new Set(txs.map((row) => row.bookingId))]);
  const all = txs
    .map((tx) => toLedgerEntry(tx, byBooking.get(tx.bookingId) || [], numberById))
    .filter((row) => matchesLedgerSearch(row, q));
  const bounds = pageBounds(all.length, input.page, input.pageSize);
  return {
    rows: all.slice(bounds.start, bounds.start + bounds.take),
    totals: ledgerTotalsOf(all),
    total: all.length,
    bounds,
  };
}

export async function listLedger(from: string, toExclusive: string) {
  const db = await getDb();
  const txs = await db
    .select()
    .from(t.bookingTransactions)
    .where(and(gte(t.bookingTransactions.paidOn, from), lt(t.bookingTransactions.paidOn, toExclusive)))
    .orderBy(desc(t.bookingTransactions.paidAt), desc(t.bookingTransactions.id));
  if (!txs.length) return [] as LedgerEntry[];
  const { byBooking, numberById } = await salesHeadsByBookingIds([...new Set(txs.map((row) => row.bookingId))]);
  return txs.map((tx) => toLedgerEntry(tx, byBooking.get(tx.bookingId) || [], numberById));
}

export async function bookingHasTransactions(bookingId: string) {
  const db = await getDb();
  const row = (
    await db.select({ id: t.bookingTransactions.id }).from(t.bookingTransactions).where(eq(t.bookingTransactions.bookingId, bookingId)).limit(1)
  )[0];
  return Boolean(row);
}