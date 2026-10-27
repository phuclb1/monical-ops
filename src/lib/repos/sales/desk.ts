import { cache } from "react";
import {
  BOOKING_PAGE_SIZE,
  bookingDeskCountQuery,
  bookingDeskPageQuery,
  bookingSearchCountQuery,
  bookingSearchPageQuery,
  cashPeriodIdsQuery,
  cashTxPeriodIdsQuery,
  pageBounds,
  type BookingDeskTab,
  type BookingSearchScope,
} from "@/lib/booking-desk";
import { getDb } from "@/db";
import { type BookingListView } from "@/lib/sales";
import { listDeskBookings, listLeanBookings, type LeanBooking } from "./queries";
import { rememberBookingRead } from "./read-cache";

type DeskBooking = LeanBooking;

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
  active_count: number | null;
  reserved_count: number | null;
  inhouse_count: number | null;
  view_new: number | null;
  view_month: number | null;
  view_checkin: number | null;
  view_stay: number | null;
  view_checkout: number | null;
  view_tomorrow: number | null;
  list_count: number | null;
};

function countOf(value: number | null | undefined) {
  return Number(value) || 0;
}

async function searchDesk(input: {
  tab: BookingDeskTab;
  view: BookingListView;
  q: string;
  find: BookingSearchScope;
  page: number;
  pageSize: number;
  today: string;
}): Promise<BookingDeskPage> {
  const db = await getDb();
  const tab = input.find === "open" ? input.tab : "active";
  const countQuery = bookingSearchCountQuery(input.q, input.today, input.view, tab, input.find);
  if (!countQuery) {
    return {
      rows: [],
      counts: { active: 0, reserved: 0, inhouse: 0 },
      viewCounts: { new: 0, month: 0, checkin: 0, stay: 0, checkout: 0, tomorrow: 0 },
      page: 1,
      pages: 1,
      total: 0,
      from: 0,
      to: 0,
    };
  }
  const counts = (await db.all<CountRow>(countQuery))[0];
  const active = countOf(counts?.active_count);
  const reserved = countOf(counts?.reserved_count);
  const inhouse = countOf(counts?.inhouse_count);
  const bounds = pageBounds(countOf(counts?.list_count), input.page, input.pageSize);
  const pageQuery = bounds.take
    ? bookingSearchPageQuery(input.q, input.today, input.view, tab, bounds.take, bounds.start, input.find)
    : null;
  const ids = pageQuery ? await db.all<{ bid: string }>(pageQuery) : [];
  const loaded = await listDeskBookings(ids.map((row) => row.bid));
  const byId = new Map(loaded.map((row) => [row.id, row]));
  return {
    rows: ids.map((row) => byId.get(row.bid)).filter((row): row is DeskBooking => Boolean(row)),
    counts: { active, reserved, inhouse },
    viewCounts: {
      new: countOf(counts?.view_new),
      month: countOf(counts?.view_month),
      checkin: countOf(counts?.view_checkin),
      stay: countOf(counts?.view_stay),
      checkout: countOf(counts?.view_checkout),
      tomorrow: countOf(counts?.view_tomorrow),
    },
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
  const active = countOf(counts?.active_count);
  const reserved = countOf(counts?.reserved_count);
  const inhouse = countOf(counts?.inhouse_count);
  const bounds = pageBounds(countOf(counts?.list_count), input.page, input.pageSize);
  const ids = bounds.take
    ? await db.all<{ bid: string }>(bookingDeskPageQuery(input.today, input.view, input.tab, bounds.take, bounds.start))
    : [];
  const loaded = await listDeskBookings(ids.map((row) => row.bid));
  const byId = new Map(loaded.map((row) => [row.id, row]));
  return {
    rows: ids.map((row) => byId.get(row.bid)).filter((row): row is DeskBooking => Boolean(row)),
    counts: { active, reserved, inhouse },
    viewCounts: {
      new: countOf(counts?.view_new),
      month: countOf(counts?.view_month),
      checkin: countOf(counts?.view_checkin),
      stay: countOf(counts?.view_stay),
      checkout: countOf(counts?.view_checkout),
      tomorrow: countOf(counts?.view_tomorrow),
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
  find?: BookingSearchScope;
  page: number;
  pageSize?: number;
  today: string;
}): Promise<BookingDeskPage> {
  const q = input.q.trim();
  const find = q && (input.find === "departed" || input.find === "all") ? input.find : "open";
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : BOOKING_PAGE_SIZE;
  const key = `desk:${input.tab}:${input.view}:${find}:${input.today}:${input.page}:${pageSize}:${q}`;
  if (q) return rememberBookingRead(key, () => searchDesk({ ...input, q, find, pageSize }));
  return rememberBookingRead(key, () => sqlDesk({ ...input, pageSize }));
});

export const listCashPeriodBookings = cache(async function listCashPeriodBookings(from: string, to: string) {
  return rememberBookingRead(`cash:${from}:${to}`, async () => {
    const db = await getDb();
    const [saleIds, txIds] = await Promise.all([
      db.all<{ bid: string }>(cashPeriodIdsQuery(from, to)),
      db.all<{ bid: string }>(cashTxPeriodIdsQuery(from, to)).catch(() => []),
    ]);
    return listLeanBookings([...new Set([...saleIds, ...txIds].map((row) => row.bid))]);
  });
});
