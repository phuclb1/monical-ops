import { cache } from "react";
import {
  BOOKING_PAGE_SIZE,
  bookingDeskCountQuery,
  bookingDeskPageQuery,
  bookingSearchIdsQuery,
  cashPeriodIdsQuery,
  pageBounds,
  summarizeBookingDesk,
  type BookingDeskTab,
} from "@/lib/booking-desk";
import { getDb } from "@/db";
import { matchesBookingSearch, type BookingListView } from "@/lib/sales";
import { bookingsByIds } from "./queries";
import { rememberBookingRead } from "./read-cache";

type DeskBooking = Awaited<ReturnType<typeof bookingsByIds>>[number];

export type BookingDeskPage = {
  rows: DeskBooking[];
  counts: Record<BookingDeskTab, number>;
  viewCounts: Record<BookingListView, number>;
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
};

type CountRow = {
  open_count: number | null;
  reserved_count: number | null;
  inhouse_count: number | null;
  done_count: number | null;
  all_count: number | null;
  view_new: number | null;
  view_checkin: number | null;
  view_checkout: number | null;
  list_count: number | null;
};

function countOf(value: number | null | undefined) {
  return Number(value) || 0;
}

async function searchDesk(input: { tab: BookingDeskTab; view: BookingListView; q: string; page: number; pageSize: number; today: string }): Promise<BookingDeskPage> {
  const db = await getDb();
  const query = bookingSearchIdsQuery(input.q);
  const ids = query ? await db.all<{ bid: string }>(query) : [];
  const bookings = await bookingsByIds(ids.map((row) => row.bid));
  const matched = bookings.filter((row) => matchesBookingSearch(row, input.q));
  const summary = summarizeBookingDesk(matched, input.tab, input.view, input.today);
  const bounds = pageBounds(summary.list.length, input.page, input.pageSize);
  return {
    rows: summary.list.slice(bounds.start, bounds.start + bounds.take),
    counts: summary.counts,
    viewCounts: summary.viewCounts,
    page: bounds.page,
    pages: bounds.pages,
    total: bounds.total,
    from: bounds.from,
    to: bounds.to,
  };
}

async function sqlDesk(input: { tab: BookingDeskTab; view: BookingListView; page: number; pageSize: number; today: string }): Promise<BookingDeskPage> {
  const db = await getDb();
  const counts = (await db.all<CountRow>(bookingDeskCountQuery(input.today, input.view, input.tab)))[0];
  const open = countOf(counts?.open_count);
  const reserved = countOf(counts?.reserved_count);
  const inhouse = countOf(counts?.inhouse_count);
  const done = countOf(counts?.done_count);
  const all = countOf(counts?.all_count);
  const bounds = pageBounds(countOf(counts?.list_count), input.page, input.pageSize);
  const ids = bounds.take
    ? await db.all<{ bid: string }>(bookingDeskPageQuery(input.today, input.view, input.tab, bounds.take, bounds.start))
    : [];
  const loaded = await bookingsByIds(ids.map((row) => row.bid));
  const byId = new Map(loaded.map((row) => [row.id, row]));
  return {
    rows: ids.map((row) => byId.get(row.bid)).filter((row): row is DeskBooking => Boolean(row)),
    counts: { open, reserved, inhouse, done, all },
    viewCounts: {
      new: countOf(counts?.view_new),
      checkin: countOf(counts?.view_checkin),
      checkout: countOf(counts?.view_checkout),
    },
    page: bounds.page,
    pages: bounds.pages,
    total: bounds.total,
    from: bounds.from,
    to: bounds.to,
  };
}

export const listBookingDesk = cache(async function listBookingDesk(input: {
  tab: BookingDeskTab;
  view: BookingListView;
  q: string;
  page: number;
  pageSize?: number;
  today: string;
}): Promise<BookingDeskPage> {
  const q = input.q.trim();
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : BOOKING_PAGE_SIZE;
  const key = `desk:${input.tab}:${input.view}:${input.today}:${input.page}:${pageSize}:${q}`;
  if (q) return rememberBookingRead(key, () => searchDesk({ ...input, q, pageSize }));
  return rememberBookingRead(key, () => sqlDesk({ ...input, pageSize }));
});

export const listCashPeriodBookings = cache(async function listCashPeriodBookings(from: string, to: string) {
  return rememberBookingRead(`cash:${from}:${to}`, async () => {
    const db = await getDb();
    const ids = await db.all<{ bid: string }>(cashPeriodIdsQuery(from, to));
    return bookingsByIds(ids.map((row) => row.bid));
  });
});
