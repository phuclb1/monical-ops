import { addDaysVN, datesUntil } from "../../datetime";
import { rekeyLegacyOpsBookingCodes } from "@/db/ops-codes";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import {
  bookingBreakfastPax,
  bookingDue,
  bookingKey,
  bookingQuote,
  ganttSpan,
  groupByBooking,
  isActiveSaleStatus,
  nightlyNetFromLine,
  nightsBetween,
  occupiesNight,
  quoteLinesBySaleId,
  rangesOverlap,
  rollupBookingStatus,
  salePaid,
} from "../../sales";
import { extraAmount } from "../../extras";
import { listRooms, listRoomTypes } from "../rooms";
import { withSaleRoom } from "./helpers";

export async function listRoomSales() {
  const db = await getDb();
  await rekeyLegacyOpsBookingCodes(db);
  const [sales, rooms] = await Promise.all([db.select().from(t.roomSales), db.select().from(t.rooms)]);
  return sales
    .map((sale) => withSaleRoom(sale, rooms))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || (a.room?.number || "").localeCompare(b.room?.number || ""));
}

export async function getRoomSale(id: string) {
  const sales = await listRoomSales();
  const sale = sales.find((row) => row.id === id) ?? null;
  if (!sale) return null;
  const peers = sale.bookingId
    ? sales
        .filter((row) => row.bookingId === sale.bookingId && row.id !== sale.id)
        .sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""))
    : [];
  return { ...sale, peers, bookingKey: bookingKey(sale) };
}

function toBookingView(id: string, rooms: Awaited<ReturnType<typeof listRoomSales>>) {
  const sorted = [...rooms].sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""));
  const first = sorted[0];
  const quote = bookingQuote(sorted);
  const paid = salePaid(first);
  const checkIn = sorted.reduce((min, row) => (row.checkIn < min ? row.checkIn : min), first.checkIn);
  const checkOut = sorted.reduce((max, row) => (row.checkOut > max ? row.checkOut : max), first.checkOut);
  const nights = Math.max(quote.nights, nightsBetween(checkIn, checkOut));
  return {
    id,
    guestName: first.guestName,
    guestPhone: first.guestPhone,
    origin: first.origin,
    source: first.source,
    pmsCode: first.pmsCode,
    notes: first.notes,
    adults: first.adults,
    children: first.children,
    breakfastAdults: bookingBreakfastPax(sorted).adults,
    breakfastChildren: bookingBreakfastPax(sorted).children,
    cars: first.cars || 0,
    bikes: first.bikes || 0,
    deposit: paid.deposit,
    cashPaid: paid.cashPaid,
    transferPaid: paid.transferPaid,
    companyPaid: paid.companyPaid,
    due: bookingDue(quote.total, paid.deposit),
    createdAt: sorted.reduce((min, row) => (row.createdAt < min ? row.createdAt : min), first.createdAt),
    checkIn,
    checkOut,
    rooms: sorted,
    roomCount: sorted.length,
    roomLabel: sorted.map((row) => `P.${row.room?.number || "—"}`).join(" · "),
    typeLabel: [...new Set(sorted.map((row) => row.room?.type || "—"))].join(" · "),
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

function withBookingExtras<T extends { id: string; nights: number; roomTotal?: number; total: number; deposit: number }>(
  view: T,
  extras: (typeof t.saleExtras.$inferSelect)[],
) {
  const rows = decorateExtras(extras, view.nights);
  const extrasTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const roomTotal = view.roomTotal ?? view.total;
  const total = roomTotal + extrasTotal;
  return { ...view, extras: rows, extrasTotal, roomTotal, total, due: bookingDue(total, view.deposit) };
}

async function listSaleExtras() {
  const db = await getDb();
  return db.select().from(t.saleExtras);
}

export async function listBookings() {
  const [sales, extras] = await Promise.all([listRoomSales(), listSaleExtras()]);
  const extraByBooking = new Map<string, (typeof extras)[number][]>();
  for (const row of extras) {
    const list = extraByBooking.get(row.bookingId) || [];
    list.push(row);
    extraByBooking.set(row.bookingId, list);
  }
  return groupByBooking(sales)
    .filter(({ id }) => !id.startsWith("seq-hold-"))
    .map(({ id, rooms }) => withBookingExtras(toBookingView(id, rooms), extraByBooking.get(id) || []))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || a.guestName.localeCompare(b.guestName));
}

export async function getBooking(id: string) {
  const sales = await listRoomSales();
  const hit = sales.find((row) => row.id === id || row.bookingId === id);
  if (!hit) return null;
  const key = bookingKey(hit);
  const extras = (await listSaleExtras()).filter((row) => row.bookingId === key);
  return withBookingExtras(
    toBookingView(
      key,
      sales.filter((row) => bookingKey(row) === key),
    ),
    extras,
  );
}

export async function salesBoard(date: string) {
  const [rooms, types, sales] = await Promise.all([listRooms(), listRoomTypes(), listRoomSales()]);
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
  const vacant = cells.filter((cell) => cell.kind === "vacant").length;
  const reserved = cells.filter((cell) => cell.kind === "reserved").length;
  const inhouse = cells.filter((cell) => cell.kind === "inhouse").length;
  const ooo = cells.filter((cell) => cell.kind === "ooo").length;
  const lineById = quoteLinesBySaleId(sales.filter((sale) => isActiveSaleStatus(sale.status)));
  const revenue = nightSales.reduce((sum, sale) => sum + nightlyNetFromLine(lineById.get(sale.id)), 0);
  const upcoming = sales
    .filter((sale) => sale.status === "reserved" && sale.checkIn > date && sale.checkIn <= addDaysVN(date, 14))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return { date, types, cells, vacant, reserved, inhouse, ooo, sold: reserved + inhouse, revenue, nightSales, upcoming };
}

export async function salesGantt(from: string, toExclusive: string) {
  const days = datesUntil(from, toExclusive);
  const [rooms, sales] = await Promise.all([listRooms(), listRoomSales()]);
  const active = sales.filter(
    (sale) => isActiveSaleStatus(sale.status) && rangesOverlap(sale.checkIn, sale.checkOut, from, toExclusive),
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
  const lineById = quoteLinesBySaleId(sales.filter((sale) => isActiveSaleStatus(sale.status)));
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
