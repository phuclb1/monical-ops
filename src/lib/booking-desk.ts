import { sql, type SQL } from "drizzle-orm";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { addDaysVN, addMonthsVN, startOfMonthVN } from "@/lib/datetime";
import { bookingMatchesListView, type BookingListView } from "@/lib/sales";
import { compactSearchText, foldSearchText, searchTokens, sqlCompact, sqlFoldSteps } from "@/lib/search-text";
import { SALE_ORIGINS, SALE_SOURCES, SALE_STATUSES } from "@/lib/types";

export const BOOKING_PAGE_SIZE = 40;
export const BOOKING_SEARCH_CANDIDATE_LIMIT = 400;
export const CASH_FLOW_PAGE_SIZE = 40;
export const PHONE_PAGE_SIZE = 10;

export const BOOKING_DESK_TABS = ["active", "reserved", "inhouse"] as const;
export type BookingDeskTab = (typeof BOOKING_DESK_TABS)[number];

export const BOOKING_SEARCH_SCOPES = ["open", "departed", "all"] as const;
export type BookingSearchScope = (typeof BOOKING_SEARCH_SCOPES)[number];

type DeskStay = {
  id: string;
  status: string;
  createdAt: string;
  checkIn: string;
  checkOut: string;
  rooms?: { checkIn: string; checkOut: string; status: string }[];
};

export function isBookingDeskTab(value: string): value is BookingDeskTab {
  return (BOOKING_DESK_TABS as readonly string[]).includes(value);
}

export function normalizeBookingDeskTab(value: string | undefined): BookingDeskTab {
  if (value === "reserved" || value === "inhouse") return value;
  return "active";
}

export function normalizeBookingSearchScope(value: string | undefined): BookingSearchScope {
  if (value === "departed" || value === "all") return value;
  return "open";
}

export function parsePage(raw: string | undefined) {
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, 10_000);
}

export function isPhoneUserAgent(ua: string) {
  if (/iPad|Tablet/i.test(ua)) return false;
  return /iPhone|iPod|Android.+Mobile|(?:^|[^a-z])Mobile(?:[^a-z]|$)/i.test(ua);
}

export function listPageSize(ua: string | null | undefined) {
  return isPhoneUserAgent(ua || "") ? PHONE_PAGE_SIZE : BOOKING_PAGE_SIZE;
}

export function matchesBookingTab(status: string, tab: BookingDeskTab) {
  if (tab === "reserved") return status === "reserved";
  if (tab === "inhouse") return status === "inhouse";
  return status === "reserved" || status === "inhouse";
}

export function pageBounds(total: number, page: number, pageSize: number) {
  const safeSize = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(total / safeSize) || 1);
  const current = total === 0 ? 1 : Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * safeSize;
  const take = total === 0 ? 0 : Math.min(safeSize, total - start);
  return {
    page: current,
    pages,
    start,
    take,
    total,
    from: total ? start + 1 : 0,
    to: start + take,
  };
}

export function summarizeBookingDesk<T extends DeskStay>(rows: T[], tab: BookingDeskTab, view: BookingListView, today: string) {
  const viewed = rows.filter((row) => bookingMatchesListView(row, view, today));
  const counts: Record<BookingDeskTab, number> = {
    active: viewed.filter((row) => matchesBookingTab(row.status, "active")).length,
    reserved: viewed.filter((row) => matchesBookingTab(row.status, "reserved")).length,
    inhouse: viewed.filter((row) => matchesBookingTab(row.status, "inhouse")).length,
  };
  const inTab = (viewName: BookingListView) =>
    rows.filter((row) => matchesBookingTab(row.status, tab) && bookingMatchesListView(row, viewName, today)).length;
  const viewCounts: Record<BookingListView, number> = {
    new: inTab("new"),
    month: inTab("month"),
    checkin: inTab("checkin"),
    stay: inTab("stay"),
    checkout: inTab("checkout"),
    tomorrow: inTab("tomorrow"),
  };
  const list = viewed
    .filter((row) => matchesBookingTab(row.status, tab))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { counts, viewCounts, list };
}

function deskDates(today: string) {
  const monthStart = startOfMonthVN(today);
  return {
    today,
    monthStart,
    monthEnd: addMonthsVN(monthStart, 1),
    tomorrow: addDaysVN(today, 1),
  };
}

function viewFilter(view: BookingListView): SQL {
  if (view === "month") return sql`checkin_month`;
  if (view === "checkin") return sql`checkin_today`;
  if (view === "stay") return sql`stay_today`;
  if (view === "checkout") return sql`checkout_today`;
  if (view === "tomorrow") return sql`checkin_tomorrow`;
  return sql`1 = 1`;
}

function tabFilter(tab: BookingDeskTab): SQL {
  if (tab === "reserved") return sql`status = 'reserved'`;
  if (tab === "inhouse") return sql`status = 'inhouse'`;
  return sql`1 = 1`;
}

function bookingHeadSelect(today: string) {
  const dates = deskDates(today);
  return sql`
  SELECT
    bid,
    MIN(created_at) AS created_at,
    CASE
      WHEN SUM(CASE WHEN status = 'inhouse' THEN 1 ELSE 0 END) > 0 THEN 'inhouse'
      WHEN SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) > 0 THEN 'reserved'
      WHEN SUM(CASE WHEN status = 'departed' THEN 1 ELSE 0 END) > 0 THEN 'departed'
      WHEN SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) > 0 THEN 'no_show'
      ELSE 'cancelled'
    END AS status,
    SUM(CASE WHEN check_in >= ${dates.monthStart} AND check_in < ${dates.monthEnd} AND status IN ('reserved', 'inhouse', 'departed') THEN 1 ELSE 0 END) > 0 AS checkin_month,
    SUM(CASE WHEN check_in = ${dates.today} AND status IN ('reserved', 'inhouse', 'departed') THEN 1 ELSE 0 END) > 0 AS checkin_today,
    SUM(CASE WHEN check_in <= ${dates.today} AND check_out > ${dates.today} AND status IN ('reserved', 'inhouse', 'departed') THEN 1 ELSE 0 END) > 0 AS stay_today,
    SUM(CASE WHEN check_out = ${dates.today} AND status IN ('reserved', 'inhouse', 'departed') THEN 1 ELSE 0 END) > 0 AS checkout_today,
    SUM(CASE WHEN check_in = ${dates.tomorrow} AND status IN ('reserved', 'inhouse', 'departed') THEN 1 ELSE 0 END) > 0 AS checkin_tomorrow
  FROM lines
  WHERE bid NOT LIKE 'seq-hold-%'
  GROUP BY bid`;
}

function bookingHeads(today: string) {
  return sql`
WITH lines AS (
  SELECT
    CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END AS bid,
    status,
    check_in,
    check_out,
    created_at
  FROM room_sales
  WHERE status IN ('reserved', 'inhouse')
),
heads AS (
  ${bookingHeadSelect(today)}
)`;
}

function deskCountSelect(view: BookingListView, tab: BookingDeskTab) {
  const viewed = viewFilter(view);
  const selected = tabFilter(tab);
  return sql`
SELECT
  COALESCE(SUM(CASE WHEN ${viewed} THEN 1 ELSE 0 END), 0) AS active_count,
  COALESCE(SUM(CASE WHEN ${viewed} AND status = 'reserved' THEN 1 ELSE 0 END), 0) AS reserved_count,
  COALESCE(SUM(CASE WHEN ${viewed} AND status = 'inhouse' THEN 1 ELSE 0 END), 0) AS inhouse_count,
  COALESCE(SUM(CASE WHEN ${selected} THEN 1 ELSE 0 END), 0) AS view_new,
  COALESCE(SUM(CASE WHEN ${selected} AND checkin_month THEN 1 ELSE 0 END), 0) AS view_month,
  COALESCE(SUM(CASE WHEN ${selected} AND checkin_today THEN 1 ELSE 0 END), 0) AS view_checkin,
  COALESCE(SUM(CASE WHEN ${selected} AND stay_today THEN 1 ELSE 0 END), 0) AS view_stay,
  COALESCE(SUM(CASE WHEN ${selected} AND checkout_today THEN 1 ELSE 0 END), 0) AS view_checkout,
  COALESCE(SUM(CASE WHEN ${selected} AND checkin_tomorrow THEN 1 ELSE 0 END), 0) AS view_tomorrow,
  COALESCE(SUM(CASE WHEN ${viewed} AND ${selected} THEN 1 ELSE 0 END), 0) AS list_count
FROM heads`;
}

export function bookingDeskCountQuery(today: string, view: BookingListView, tab: BookingDeskTab) {
  return sql`
${bookingHeads(today)}
${deskCountSelect(view, tab)}`;
}

export function bookingDeskPageQuery(today: string, view: BookingListView, tab: BookingDeskTab, limit: number, offset: number) {
  return sql`
${bookingHeads(today)}
SELECT bid
FROM heads
WHERE ${viewFilter(view)} AND ${tabFilter(tab)}
ORDER BY created_at DESC, bid DESC
LIMIT ${limit} OFFSET ${offset}`;
}

function likeContains(value: string) {
  return `%${value.replace(/[%_]/g, "")}%`;
}

function isoFromSearchToken(token: string) {
  const numeric = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  return "";
}

function codesMatchingLabel<T extends string>(codes: readonly T[], labels: Record<T, string>, token: string) {
  return codes.filter((code) => {
    const compact = compactSearchText(token);
    return (
      foldSearchText(code).includes(token) ||
      foldSearchText(labels[code] || "").includes(token) ||
      (compact.length >= 3 && compactSearchText(foldSearchText(labels[code] || "")).includes(compact))
    );
  });
}

function bookingSearchTokenClause(token: string) {
  const like = likeContains(token);
  const compact = compactSearchText(token);
  const digits = token.replace(/\D/g, "");
  const iso = isoFromSearchToken(token);
  const sources = codesMatchingLabel(SALE_SOURCES, SALE_SOURCE_LABEL, token);
  const statuses = codesMatchingLabel(SALE_STATUSES, SALE_STATUS_LABEL, token);
  const origins = codesMatchingLabel(SALE_ORIGINS, SALE_ORIGIN_LABEL, token);
  const clauses: SQL[] = [sql`hay LIKE ${like}`];
  if (compact) {
    clauses.push(sql`${sqlCompact(sql`ifnull(pms_code, '')`)} LIKE ${likeContains(compact)}`);
    clauses.push(sql`${sqlCompact(sql`ifnull(guest_phone, '')`)} LIKE ${likeContains(compact)}`);
    clauses.push(sql`${sqlCompact(sql`id`)} LIKE ${likeContains(compact)}`);
  }
  if (digits) {
    clauses.push(sql`replace(replace(ifnull(guest_phone, ''), ' ', ''), '-', '') LIKE ${likeContains(digits)}`);
    clauses.push(sql`room_number LIKE ${likeContains(digits)}`);
  }
  if (iso) {
    clauses.push(sql`check_in = ${iso}`);
    clauses.push(sql`check_out = ${iso}`);
  }
  if (sources.length) clauses.push(sql`source IN (${sql.join(sources.map((value) => sql`${value}`), sql`, `)})`);
  if (statuses.length) clauses.push(sql`status IN (${sql.join(statuses.map((value) => sql`${value}`), sql`, `)})`);
  if (origins.length) clauses.push(sql`origin IN (${sql.join(origins.map((value) => sql`${value}`), sql`, `)})`);
  return clauses.reduce((left, right) => sql`${left} OR ${right}`);
}

const SEARCH_COLS = sql`bid, id, guest_phone, pms_code, source, origin, status, check_in, check_out, room_number`;

function searchStatusSql(scope: BookingSearchScope): SQL {
  if (scope === "departed") return sql`s.status = 'departed'`;
  if (scope === "all") return sql`1 = 1`;
  return sql`s.status IN ('reserved', 'inhouse')`;
}

function lineStatusSql(scope: BookingSearchScope): SQL {
  if (scope === "departed") return sql`status = 'departed'`;
  if (scope === "all") return sql`1 = 1`;
  return sql`status IN ('reserved', 'inhouse')`;
}

function searchSrc(scope: BookingSearchScope) {
  return sql`
  SELECT
    CASE WHEN s.booking_id IS NOT NULL AND trim(s.booking_id) != '' THEN s.booking_id ELSE s.id END AS bid,
    s.id,
    s.guest_phone,
    s.pms_code,
    s.source,
    s.origin,
    s.status,
    s.check_in,
    s.check_out,
    r.number AS room_number,
    lower(s.guest_name) || ' ' ||
      lower(ifnull(s.guest_phone, '')) || ' ' ||
      lower(ifnull(s.pms_code, '')) || ' ' ||
      lower(ifnull(s.notes, '')) || ' ' ||
      lower(s.id) || ' ' ||
      lower(ifnull(s.booking_id, '')) || ' ' ||
      lower(s.source) || ' ' ||
      lower(s.origin) || ' ' ||
      lower(s.status) || ' ' ||
      s.check_in || ' ' ||
      s.check_out || ' ' ||
      lower(ifnull(r.number, '')) || ' ' ||
      lower(ifnull(r.type, '')) || ' ' ||
      ('p.' || ifnull(r.number, '')) || ' ' ||
      lower(ifnull(e.name, '')) AS hay
  FROM room_sales s
  LEFT JOIN rooms r ON r.id = s.room_id
  LEFT JOIN sale_extras e ON e.booking_id = CASE WHEN s.booking_id IS NOT NULL AND trim(s.booking_id) != '' THEN s.booking_id ELSE s.id END
  WHERE ${searchStatusSql(scope)}
    AND (CASE WHEN s.booking_id IS NOT NULL AND trim(s.booking_id) != '' THEN s.booking_id ELSE s.id END) NOT LIKE 'seq-hold-%'
`;
}

function bookingSearchParts(query: string) {
  const tokens = searchTokens(query);
  if (!tokens.length) return null;
  const match = tokens.map(bookingSearchTokenClause).reduce((left, right) => sql`(${left}) AND (${right})`);
  const steps = sqlFoldSteps(sql`hay`);
  const layers = steps.map((expr, index) => {
    const from = index === 0 ? sql`src` : sql.raw(`f${index - 1}`);
    return sql`${sql.raw(`f${index}`)} AS (SELECT ${SEARCH_COLS}, ${expr} AS hay FROM ${from})`;
  });
  const last = sql.raw(`f${Math.max(steps.length - 1, 0)}`);
  return { match, last, layers };
}

function bookingSearchMatchedCte(query: string, scope: BookingSearchScope) {
  const parts = bookingSearchParts(query);
  if (!parts) return null;
  return sql`
WITH src AS (
${searchSrc(scope)}
),
${sql.join(parts.layers, sql`,
`)},
matched AS (
  SELECT DISTINCT bid
  FROM ${parts.last}
  WHERE ${parts.match}
  LIMIT ${BOOKING_SEARCH_CANDIDATE_LIMIT}
)`;
}

function bookingSearchHeads(query: string, today: string, scope: BookingSearchScope) {
  const matched = bookingSearchMatchedCte(query, scope);
  if (!matched) return null;
  return sql`
${matched},
lines AS (
  SELECT
    CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END AS bid,
    status,
    check_in,
    check_out,
    created_at
  FROM room_sales
  WHERE ${lineStatusSql(scope)}
    AND (CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END) IN (SELECT bid FROM matched)
),
heads AS (
  ${bookingHeadSelect(today)}
)`;
}

export function bookingSearchIdsQuery(query: string, scope: BookingSearchScope = "open") {
  const matched = bookingSearchMatchedCte(query, scope);
  if (!matched) return null;
  return sql`
${matched}
SELECT bid
FROM matched`;
}

function searchTab(scope: BookingSearchScope, tab: BookingDeskTab): BookingDeskTab {
  return scope === "open" ? tab : "active";
}

export function bookingSearchCountQuery(
  query: string,
  today: string,
  view: BookingListView,
  tab: BookingDeskTab,
  scope: BookingSearchScope = "open",
) {
  const heads = bookingSearchHeads(query, today, scope);
  if (!heads) return null;
  return sql`
${heads}
${deskCountSelect(view, searchTab(scope, tab))} `;
}

export function bookingSearchPageQuery(
  query: string,
  today: string,
  view: BookingListView,
  tab: BookingDeskTab,
  limit: number,
  offset: number,
  scope: BookingSearchScope = "open",
) {
  const heads = bookingSearchHeads(query, today, scope);
  if (!heads) return null;
  return sql`
${heads}
SELECT bid
FROM heads
WHERE ${viewFilter(view)} AND ${tabFilter(searchTab(scope, tab))}
ORDER BY created_at DESC, bid DESC
LIMIT ${limit} OFFSET ${offset}`;
}

export function cashPeriodIdsQuery(from: string, to: string) {
  return sql`
SELECT DISTINCT bid FROM (
  SELECT
    CASE WHEN booking_id IS NOT NULL AND trim(booking_id) != '' THEN booking_id ELSE id END AS bid,
    status,
    check_in,
    refunded_at,
    refund_cash,
    refund_transfer,
    refund_company
  FROM room_sales
) lines
WHERE bid NOT LIKE 'seq-hold-%'
  AND (
    (status NOT IN ('cancelled', 'no_show') AND check_in >= ${from} AND check_in < ${to})
    OR (
      refunded_at IS NOT NULL
      AND substr(refunded_at, 1, 10) >= ${from}
      AND substr(refunded_at, 1, 10) < ${to}
      AND (IFNULL(refund_cash, 0) + IFNULL(refund_transfer, 0) + IFNULL(refund_company, 0)) > 0
    )
  )`;
}

export function cashTxPeriodIdsQuery(from: string, to: string) {
  return sql`
SELECT DISTINCT booking_id AS bid
FROM booking_transactions
WHERE booking_id NOT LIKE 'seq-hold-%'
  AND paid_on >= ${from}
  AND paid_on < ${to}`;
}
