import { cache } from "react";
import { and, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { addDaysVN, datesUntil } from "../../datetime";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import {
  bookingBreakfastPax,
  bookingStayPax,
  bookingDue,
  bookingKey,
  bookingRefundKeep,
  bookingQuote,
  computeBookingMoney,
  ganttSpan,
  groupByBooking,
  billableSaleRows,
  isActiveSaleStatus,
  isGanttSaleStatus,
  nightlyNetFromLine,
  nightsBetween,
  occupiesNight,
  quoteLinesBySaleId,
  rangesOverlap,
  rollupBookingStatus,
  refundTotal,
  salePaid,
  summarizeSalesNight,
} from "../../sales";
import { extraAmount } from "../../extras";
import { ACTIVE_SALE_STATUSES } from "../../types";
import { listRooms, listRoomTypes } from "../rooms";
import { withSaleRoom } from "./helpers";

const GANTT_SALE_STATUSES = ["reserved", "inhouse", "departed"] as const;
const LIVE_SALE_STATUSES = ["reserved", "inhouse", "departed"] as const;

function sortSales<T extends { checkIn: string; room?: { number: string } | null }>(sales: T[]) {
  return sales.sort((a, b) => b.checkIn.localeCompare(a.checkIn) || (a.room?.number || "").localeCompare(b.room?.number || ""));
}

export function bookingIdsOf(rows: { id: string; bookingId?: string | null }[]) {
  return [...new Set(rows.map((row) => bookingKey(row)).filter((id) => id && !id.startsWith("seq-hold-")))];
}

export function bookingMatchesLookup(booking: { id: string; rooms: { id: string }[] }, wanted: Set<string>) {
  return wanted.has(booking.id) || booking.rooms.some((room) => wanted.has(room.id));
}

async function decorateSales(sales: (typeof t.roomSales.$inferSelect)[]) {
  const rooms = await listRooms();
  return sortSales(sales.map((sale) => withSaleRoom(sale, rooms)));
}

type DecoratedSale = Awaited<ReturnType<typeof decorateSales>>[number];

export const listActiveRoomSales = cache(async () => {
  const db = await getDb();
  return decorateSales(await db.select().from(t.roomSales).where(inArray(t.roomSales.status, ACTIVE_SALE_STATUSES)));
});

export async function listRoomSalesOverlapping(from: string, toExclusive: string, statuses?: readonly string[]) {
  const db = await getDb();
  const clauses: SQL[] = [lt(t.roomSales.checkIn, toExclusive), gt(t.roomSales.checkOut, from)];
  if (statuses?.length) clauses.push(inArray(t.roomSales.status, [...statuses]));
  return decorateSales(await db.select().from(t.roomSales).where(and(...clauses)));
}

export async function getRoomSale(id: string) {
  const db = await getDb();
  const rooms = await listRooms();
  const sale = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!sale) return null;
  const peers = sale.bookingId
    ? (await db.select().from(t.roomSales).where(eq(t.roomSales.bookingId, sale.bookingId)))
        .filter((row) => row.id !== sale.id)
        .map((row) => withSaleRoom(row, rooms))
        .sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""))
    : [];
  return { ...withSaleRoom(sale, rooms), peers, bookingKey: bookingKey(sale) };
}

function toBookingView(id: string, rooms: DecoratedSale[]) {
  const sorted = [...rooms].sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""));
  const priced = billableSaleRows(sorted);
  const head = priced[0];
  const stay = bookingStayPax(priced);
  const quote = bookingQuote(priced);
  const paid = salePaid(head);
  const checkIn = priced.reduce((min, row) => (row.checkIn < min ? row.checkIn : min), head.checkIn);
  const checkOut = priced.reduce((max, row) => (row.checkOut > max ? row.checkOut : max), head.checkOut);
  const nights = Math.max(quote.nights, nightsBetween(checkIn, checkOut));
  return {
    id,
    guestName: head.guestName,
    guestPhone: head.guestPhone,
    origin: head.origin,
    source: head.source,
    otaPaymentMode: head.otaPaymentMode,
    otaCommissionKind: head.otaCommissionKind === "amount" ? "amount" : "percent",
    otaCommissionValue: head.otaCommissionValue || (head.otaCommissionKind === "amount" ? 0 : Math.min(100, Math.max(0, Math.round(head.otaCommissionPercent || 0)))),
    otaCommissionPercent: Math.min(100, Math.max(0, Math.round(head.otaCommissionPercent || 0))),
    invoiceRequested: head.invoiceRequested,
    pmsCode: head.pmsCode,
    notes: head.notes,
    adults: stay.adults,
    children: stay.children,
    breakfastAdults: bookingBreakfastPax(priced).adults,
    breakfastChildren: bookingBreakfastPax(priced).children,
    cars: head.cars || 0,
    bikes: head.bikes || 0,
    deposit: paid.deposit,
    checkinPaid: Math.max(0, Math.round(head.checkinPaid || 0)),
    checkinMethod: head.checkinMethod || "",
    cashPaid: paid.cashPaid,
    transferPaid: paid.transferPaid,
    companyPaid: paid.companyPaid,
    refundCash: rooms.reduce((max, row) => Math.max(max, row.refundCash || 0), 0),
    refundTransfer: rooms.reduce((max, row) => Math.max(max, row.refundTransfer || 0), 0),
    refundCompany: rooms.reduce((max, row) => Math.max(max, row.refundCompany || 0), 0),
    refundTotal: rooms.reduce((max, row) => Math.max(max, row.refundTotal || 0, refundTotal(row)), 0),
    refundedAt: rooms.map((row) => row.refundedAt).filter(Boolean).sort()[0] || null,
    refundReason: rooms.map((row) => row.refundReason).filter(Boolean).at(-1) || "",
    bookingTotal: rooms.reduce((max, row) => Math.max(max, row.bookingTotal || 0), 0),
    due: bookingDue(quote.total, paid.deposit),
    createdAt: sorted.reduce((min, row) => (row.createdAt < min ? row.createdAt : min), sorted[0].createdAt),
    checkIn,
    checkOut,
    rooms: sorted,
    roomCount: priced.length,
    roomLabel: priced.map((row) => `P.${row.room?.number || "—"}`).join(" · "),
    typeLabel: [...new Set(priced.map((row) => row.room?.type || "—"))].join(" · "),
    status: rollupBookingStatus(sorted.map((row) => row.status)),
    nights,
    subtotal: quote.subtotal,
    discount: quote.discount,
    breakfastOff: quote.breakfastOff,
    roomTotal: quote.total,
    extras: [] as ReturnType<typeof decorateExtras>,
    extrasTotal: 0,
    total: quote.total,
  };
}

function decorateExtras(rows: (typeof t.saleExtras.$inferSelect)[], nights: number) {
  return rows
    .map((row) => ({ ...row, amount: extraAmount(row, nights) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
}

function withBookingExtras<T extends {
  id: string;
  nights: number;
  rooms: Parameters<typeof computeBookingMoney>[0];
  deposit: number;
  bookingTotal?: number | null;
}>(
  view: T,
  extras: (typeof t.saleExtras.$inferSelect)[],
) {
  const money = computeBookingMoney(view.rooms, extras);
  const rows = decorateExtras(extras, money.nights || view.nights);
  const stored = Math.max(0, Math.round(view.bookingTotal || 0));
  const total = stored || money.total;
  return {
    ...view,
    extras: rows,
    extrasTotal: money.extrasTotal,
    roomTotal: money.roomTotal,
    refundKeep: bookingRefundKeep(money.quoted, total),
    total,
    due: bookingDue(total, money.deposit, money.refunded),
  };
}

export function leanBookingFromRooms(id: string, rooms: DecoratedSale[], extras: (typeof t.saleExtras.$inferSelect)[] = []) {
  const view = toBookingView(id, rooms);
  const money = computeBookingMoney(rooms, extras);
  const stored = Math.max(0, Math.round(view.bookingTotal || 0));
  const total = stored || money.total;
  return {
    ...view,
    extras: decorateExtras(extras, money.nights || view.nights),
    extrasTotal: money.extrasTotal,
    roomTotal: money.roomTotal,
    refundKeep: bookingRefundKeep(money.quoted || money.roomTotal + money.extrasTotal, total),
    total,
    due: bookingDue(total, view.deposit, view.refundTotal),
    transactions: [] as (typeof t.bookingTransactions.$inferSelect)[],
  };
}

export type LeanBooking = ReturnType<typeof leanBookingFromRooms>;

/** D1 allows 100 bound parameters. Each id is bound on both booking_id and id. */
export const BOOKING_LOOKUP_CHUNK = 40;

async function loadSalesByBookingIds(ids: string[]) {
  const db = await getDb();
  const rooms = await listRooms();
  const sales: (typeof t.roomSales.$inferSelect)[] = [];
  for (let index = 0; index < ids.length; index += BOOKING_LOOKUP_CHUNK) {
    const chunk = ids.slice(index, index + BOOKING_LOOKUP_CHUNK);
    sales.push(...(await db.select().from(t.roomSales).where(or(inArray(t.roomSales.bookingId, chunk), inArray(t.roomSales.id, chunk)))));
  }
  return sales.map((sale) => withSaleRoom(sale, rooms));
}

async function loadExtrasByBookingIds(ids: string[]) {
  if (!ids.length) return [] as (typeof t.saleExtras.$inferSelect)[];
  const db = await getDb();
  const extras: (typeof t.saleExtras.$inferSelect)[] = [];
  for (let index = 0; index < ids.length; index += BOOKING_LOOKUP_CHUNK) {
    const chunk = ids.slice(index, index + BOOKING_LOOKUP_CHUNK);
    extras.push(...(await db.select().from(t.saleExtras).where(inArray(t.saleExtras.bookingId, chunk))));
  }
  return extras;
}

export async function listLeanBookings(ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id && !id.startsWith("seq-hold-")))];
  if (!unique.length) return [] as LeanBooking[];
  const sales = await loadSalesByBookingIds(unique);
  const grouped = groupByBooking(sales).filter(({ id }) => !id.startsWith("seq-hold-"));
  const extras = await loadExtrasByBookingIds(grouped.map(({ id }) => id));
  const extraByBooking = new Map<string, (typeof extras)[number][]>();
  for (const row of extras) {
    const list = extraByBooking.get(row.bookingId) || [];
    list.push(row);
    extraByBooking.set(row.bookingId, list);
  }
  const wanted = new Set(unique);
  return grouped
    .map(({ id, rooms }) => leanBookingFromRooms(id, rooms, extraByBooking.get(id) || []))
    .filter((row) => bookingMatchesLookup(row, wanted))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || a.guestName.localeCompare(b.guestName));
}

export const listDeskBookings = listLeanBookings;

function assembleBookings(
  sales: DecoratedSale[],
  extras: (typeof t.saleExtras.$inferSelect)[],
  txs: (typeof t.bookingTransactions.$inferSelect)[] = [],
) {
  const extraByBooking = new Map<string, (typeof extras)[number][]>();
  for (const row of extras) {
    const list = extraByBooking.get(row.bookingId) || [];
    list.push(row);
    extraByBooking.set(row.bookingId, list);
  }
  const txByBooking = new Map<string, (typeof txs)[number][]>();
  for (const row of txs) {
    const list = txByBooking.get(row.bookingId) || [];
    list.push(row);
    txByBooking.set(row.bookingId, list);
  }
  return groupByBooking(sales)
    .filter(({ id }) => !id.startsWith("seq-hold-"))
    .map(({ id, rooms }) => ({
      ...withBookingExtras(toBookingView(id, rooms), extraByBooking.get(id) || []),
      transactions: (txByBooking.get(id) || []).sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || a.guestName.localeCompare(b.guestName));
}

export async function bookingsByIds(ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id && !id.startsWith("seq-hold-")))];
  if (!unique.length) return [];
  const db = await getDb();
  const rooms = await listRooms();
  const sales: (typeof t.roomSales.$inferSelect)[] = [];
  const extras: (typeof t.saleExtras.$inferSelect)[] = [];
  const txs: (typeof t.bookingTransactions.$inferSelect)[] = [];
  for (let index = 0; index < unique.length; index += BOOKING_LOOKUP_CHUNK) {
    const chunk = unique.slice(index, index + BOOKING_LOOKUP_CHUNK);
    const [saleRows, extraRows, txRows] = await Promise.all([
      db.select().from(t.roomSales).where(or(inArray(t.roomSales.bookingId, chunk), inArray(t.roomSales.id, chunk))),
      db.select().from(t.saleExtras).where(inArray(t.saleExtras.bookingId, chunk)),
      db.select().from(t.bookingTransactions).where(inArray(t.bookingTransactions.bookingId, chunk)),
    ]);
    sales.push(...saleRows);
    extras.push(...extraRows);
    txs.push(...txRows);
  }
  const wanted = new Set(unique);
  return assembleBookings(
    sales.map((sale) => withSaleRoom(sale, rooms)),
    extras,
    txs,
  ).filter((row) => bookingMatchesLookup(row, wanted));
}

async function bookingIdsWhere(where: SQL | undefined) {
  if (!where) return [];
  const db = await getDb();
  const rows = await db.select({ id: t.roomSales.id, bookingId: t.roomSales.bookingId }).from(t.roomSales).where(where);
  return bookingIdsOf(rows);
}

export async function resolveBookingKey(id: string) {
  const trimmed = id.trim();
  if (!trimmed || trimmed.startsWith("seq-hold-")) return null;
  const keys = await bookingIdsWhere(or(eq(t.roomSales.bookingId, trimmed), eq(t.roomSales.id, trimmed)));
  return keys[0] ?? null;
}

export async function findBookingRefByPmsCode(code: string) {
  const value = code.trim();
  if (!value) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: t.roomSales.id, bookingId: t.roomSales.bookingId })
    .from(t.roomSales)
    .where(sql`lower(${t.roomSales.pmsCode}) = ${value.toLowerCase()}`)
    .limit(1);
  return rows[0] ? bookingKey(rows[0]) : null;
}

export async function getBooking(id: string) {
  const key = await resolveBookingKey(id);
  if (!key) return null;
  return (await bookingsByIds([key]))[0] ?? null;
}

export const listBookingsByCheckIn = cache(async (from: string, toExclusive: string) => {
  const ids = await bookingIdsWhere(
    and(gte(t.roomSales.checkIn, from), lt(t.roomSales.checkIn, toExclusive), inArray(t.roomSales.status, [...LIVE_SALE_STATUSES])),
  );
  return listLeanBookings(ids);
});

export const listBookingsOverlapping = cache(async (from: string, toExclusive: string) => {
  const ids = await bookingIdsWhere(
    and(lt(t.roomSales.checkIn, toExclusive), gt(t.roomSales.checkOut, from), inArray(t.roomSales.status, [...LIVE_SALE_STATUSES])),
  );
  return bookingsByIds(ids);
});

export const listBookingsOnStayDate = cache(async (date: string) => {
  const ids = await bookingIdsWhere(or(eq(t.roomSales.checkIn, date), eq(t.roomSales.checkOut, date)));
  return bookingsByIds(ids);
});

async function recentBookingIds(limit: number) {
  const db = await getDb();
  const rows = await db.all<{ bid: string }>(sql`
    SELECT CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END AS bid
    FROM room_sales
    WHERE (CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END) NOT LIKE 'seq-hold-%'
    GROUP BY bid
    ORDER BY MIN(created_at) DESC
    LIMIT ${limit}
  `);
  return rows.map((row) => row.bid).filter(Boolean);
}

export const listHomeBookings = cache(async (today: string) => {
  const from = addDaysVN(today, -6);
  const to = addDaysVN(today, 1);
  const [checkInIds, createdIds, recent] = await Promise.all([
    bookingIdsWhere(and(gte(t.roomSales.checkIn, from), lt(t.roomSales.checkIn, to), inArray(t.roomSales.status, [...LIVE_SALE_STATUSES]))),
    bookingIdsWhere(and(gte(t.roomSales.createdAt, today), lt(t.roomSales.createdAt, to))),
    recentBookingIds(6),
  ]);
  return bookingsByIds([...checkInIds, ...createdIds, ...recent]);
});

export async function listOpenBookingRefs(input: {
  from?: string;
  to?: string;
  statuses?: string[];
  origin?: string;
  since?: string;
  limit: number;
}) {
  const clauses: SQL[] = [];
  if (input.statuses?.length) clauses.push(inArray(t.roomSales.status, input.statuses));
  if (input.origin) clauses.push(eq(t.roomSales.origin, input.origin));
  if (input.from) clauses.push(gt(t.roomSales.checkOut, input.from));
  if (input.to) clauses.push(lt(t.roomSales.checkIn, input.to));
  if (input.since) {
    const since = or(gt(t.roomSales.updatedAt, input.since), gt(t.roomSales.createdAt, input.since));
    if (since) clauses.push(since);
  }
  const db = await getDb();
  const rows = await db
    .select({
      id: t.roomSales.id,
      bookingId: t.roomSales.bookingId,
      createdAt: t.roomSales.createdAt,
      updatedAt: t.roomSales.updatedAt,
    })
    .from(t.roomSales)
    .where(clauses.length ? and(...clauses) : sql`1 = 1`)
    .orderBy(desc(t.roomSales.createdAt));
  return bookingIdsOf(rows).slice(0, input.limit);
}

export async function salesBoard(date: string) {
  const [rooms, types, sales] = await Promise.all([listRooms(), listRoomTypes(), listActiveRoomSales()]);
  const nightSales = sales.filter((sale) => isActiveSaleStatus(sale.status) && occupiesNight(sale.checkIn, sale.checkOut, date));
  const byRoom = new Map(nightSales.map((sale) => [sale.roomId, sale]));
  const cells = rooms
    .slice()
    .sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number))
    .map((room) => {
      const sale = byRoom.get(room.id) ?? null;
      const kind =
        room.opsStatus === "ooo" ? "ooo" : sale?.status === "inhouse" ? "inhouse" : sale ? "reserved" : "vacant";
      return { room, sale, kind };
    });
  const lineById = quoteLinesBySaleId(sales.filter((sale) => isActiveSaleStatus(sale.status)));
  const counts = summarizeSalesNight(rooms, sales, date, lineById);
  const upcoming = sales
    .filter((sale) => sale.status === "reserved" && sale.checkIn > date && sale.checkIn <= addDaysVN(date, 14))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return { date, types, cells, ...counts, upcoming };
}

export const salesTodaySummary = cache(async (date: string) => {
  const db = await getDb();
  const [rooms, sales] = await Promise.all([
    listRooms(),
    db
      .select()
      .from(t.roomSales)
      .where(
        and(
          inArray(t.roomSales.status, ACTIVE_SALE_STATUSES),
          lte(t.roomSales.checkIn, date),
          gt(t.roomSales.checkOut, date),
        ),
      ),
  ]);
  return summarizeSalesNight(rooms, sales, date, quoteLinesBySaleId(sales));
});

export async function salesGantt(from: string, toExclusive: string) {
  const days = datesUntil(from, toExclusive);
  const [rooms, sales] = await Promise.all([listRooms(), listRoomSalesOverlapping(from, toExclusive, GANTT_SALE_STATUSES)]);
  const active = sales.filter(
    (sale) => isGanttSaleStatus(sale.status) && rangesOverlap(sale.checkIn, sale.checkOut, from, toExclusive),
  );
  const rows = rooms
    .slice()
    .sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number))
    .map((room) => {
      const bars = active
        .filter((sale) => sale.roomId === room.id)
        .map((sale) => {
          const span = ganttSpan(sale.checkIn, sale.checkOut, from, days.length);
          return span ? { sale, ...span } : null;
        })
        .filter((bar): bar is { sale: (typeof active)[number]; start: number; end: number; nightStart: number; nightEnd: number } => Boolean(bar))
        .sort((a, b) => a.start - b.start);
      return { room, bars };
    });
  const lineById = quoteLinesBySaleId(sales.filter((sale) => isGanttSaleStatus(sale.status)));
  let soldNights = 0;
  let revenue = 0;
  for (const date of days) {
    for (const sale of active) {
      if (!occupiesNight(sale.checkIn, sale.checkOut, date)) continue;
      soldNights += 1;
      revenue += nightlyNetFromLine(lineById.get(sale.id));
    }
  }
  const ooo = rows.filter((row) => row.room.opsStatus === "ooo").length;
  const sellable = Math.max(0, rows.length - ooo);
  const vacantNights = Math.max(0, sellable * days.length - soldNights);
  return { from, to: toExclusive, days, rows, sales: active, soldNights, vacantNights, ooo, revenue, sellable };
}
