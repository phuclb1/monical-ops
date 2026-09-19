import { addDaysVN, prevDate, WEEKDAYS, weekdayISO } from "./datetime";
import { defaultAdultsForRoomType } from "./rooms-catalog";
import { bookingBreakfastPax, bookingKey, bookingStayPax, groupByBooking, occupiesNight } from "./sales";

export type BreakfastSale = {
  id: string;
  bookingId?: string | null;
  guestName: string;
  guestPhone?: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  adults?: number | null;
  children?: number | null;
  breakfast?: boolean | null;
  breakfastAdults?: number | null;
  breakfastChildren?: number | null;
  pmsCode?: string | null;
  source?: string | null;
  room?: { number: string; type: string } | null;
};

export type BreakfastKind = "checked_in" | "expected";

export type BreakfastRow = {
  saleId: string;
  bookingId: string;
  roomNumber: string;
  roomType: string;
  typeLabel: string;
  guestName: string;
  guestPhone: string | null;
  bookingRef: string;
  source: string | null;
  status: string;
  kind: BreakfastKind;
  stayAdults: number;
  stayChildren: number;
  adults: number;
  children: number;
  servings: number;
};

export type BreakfastDay = {
  date: string;
  weekday: (typeof WEEKDAYS)[number];
  rows: BreakfastRow[];
  rooms: number;
  stayAdults: number;
  stayChildren: number;
  adults: number;
  children: number;
  servings: number;
  checkedIn: number;
  expected: number;
};

const TYPE_ABBR: Record<string, string> = {
  vip: "VIP",
  senior: "SNR",
  deluxe: "DEL",
  superior: "SUP",
  standard: "STD",
  family: "FAM",
  dorm: "DORM",
  triple: "TRIP",
  twin: "TWN",
};

function titleType(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "vip") return "VIP";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function roomTypeLabel(typeName: string, types: { name: string; code?: string }[]) {
  const pretty = titleType(typeName || "—");
  const hit = types.find((row) => row.name === typeName);
  if (!hit?.code) return pretty;
  const [head, ...rest] = hit.code.split("-");
  let abbr = TYPE_ABBR[head] || head.slice(0, 3).toUpperCase();
  if (rest.includes("view")) abbr += "_V";
  if (rest.includes("plus")) abbr += "_P";
  return `${pretty} (${abbr})`;
}

function bookingRef(sale: BreakfastSale) {
  const code = sale.pmsCode?.trim();
  if (code) return code;
  const key = bookingKey(sale);
  return key.replace(/^sale-/, "").replace(/^bk-/, "");
}

type RoomTypeInfo = { name: string; code?: string; adults?: number | null };

function kindOf(status: string): BreakfastKind {
  return status === "reserved" ? "expected" : "checked_in";
}

function occupiesBreakfastNight(sale: BreakfastSale, date: string) {
  if (sale.status === "cancelled" || sale.status === "no_show") return false;
  return occupiesNight(sale.checkIn, sale.checkOut, prevDate(date));
}

export function eatsBreakfastOn(sale: BreakfastSale, date: string) {
  return occupiesBreakfastNight(sale, date) && sale.breakfast !== false;
}

function splitCount(total: number, weights: number[]) {
  const n = weights.length;
  if (!n) return [];
  const safe = Math.max(0, Math.round(total));
  if (n === 1) return [safe];
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const parts = Array.from({ length: n }, () => 0);
  if (!safe) return parts;
  if (sum <= 0) {
    const base = Math.floor(safe / n);
    for (let i = 0; i < n; i += 1) parts[i] = base;
    for (let i = 0; i < safe - base * n; i += 1) parts[n - 1 - i] += 1;
    return parts;
  }
  let used = 0;
  for (let i = 0; i < n - 1; i += 1) {
    parts[i] = Math.floor((safe * weights[i]) / sum);
    used += parts[i];
  }
  parts[n - 1] = safe - used;
  return parts;
}

function occupancyWeight(sale: BreakfastSale, types: RoomTypeInfo[]) {
  const type = types.find((row) => row.name === (sale.room?.type || ""));
  return defaultAdultsForRoomType(sale.room?.type || "", type?.adults);
}

function toBreakfastRow(
  sale: BreakfastSale,
  stay: { adults: number; children: number },
  adults: number,
  children: number,
  types: RoomTypeInfo[],
): BreakfastRow {
  const typeName = sale.room?.type || "—";
  return {
    saleId: sale.id,
    bookingId: bookingKey(sale),
    roomNumber: sale.room?.number || "—",
    roomType: typeName,
    typeLabel: roomTypeLabel(typeName, types),
    guestName: sale.guestName,
    guestPhone: sale.guestPhone || null,
    bookingRef: bookingRef(sale),
    source: sale.source || null,
    status: sale.status,
    kind: kindOf(sale.status),
    stayAdults: stay.adults,
    stayChildren: stay.children,
    adults,
    children,
    servings: adults + children,
  };
}

export function breakfastRows(
  sales: BreakfastSale[],
  date: string,
  types: RoomTypeInfo[] = [],
): BreakfastRow[] {
  const rows: BreakfastRow[] = [];
  for (const { rooms } of groupByBooking(sales.filter((sale) => occupiesBreakfastNight(sale, date)))) {
    const stay = bookingStayPax(rooms);
    const breakfast = bookingBreakfastPax(rooms);
    const eating = [...rooms]
      .filter((sale) => sale.breakfast !== false)
      .sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || "", "vi") || a.id.localeCompare(b.id));
    if (!eating.length || breakfast.adults + breakfast.children <= 0) continue;
    const adultParts = splitCount(
      breakfast.adults,
      eating.map((sale) => occupancyWeight(sale, types)),
    );
    const childParts = splitCount(
      breakfast.children,
      eating.map((sale) => occupancyWeight(sale, types)),
    );
    eating.forEach((sale, i) => {
      rows.push(toBreakfastRow(sale, stay, adultParts[i], childParts[i], types));
    });
  }
  return rows.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "vi") || a.guestName.localeCompare(b.guestName, "vi"));
}

function summarize(date: string, rows: BreakfastRow[]): BreakfastDay {
  const iso = weekdayISO(date);
  const weekday = WEEKDAYS.find((day) => day.iso === iso) ?? WEEKDAYS[0];
  const seen = new Set<string>();
  let stayAdults = 0;
  let stayChildren = 0;
  for (const row of rows) {
    if (seen.has(row.bookingId)) continue;
    seen.add(row.bookingId);
    stayAdults += row.stayAdults;
    stayChildren += row.stayChildren;
  }
  return {
    date,
    weekday,
    rows,
    rooms: rows.length,
    stayAdults,
    stayChildren,
    adults: rows.reduce((sum, row) => sum + row.adults, 0),
    children: rows.reduce((sum, row) => sum + row.children, 0),
    servings: rows.reduce((sum, row) => sum + row.servings, 0),
    checkedIn: rows.filter((row) => row.kind === "checked_in").reduce((sum, row) => sum + row.servings, 0),
    expected: rows.filter((row) => row.kind === "expected").reduce((sum, row) => sum + row.servings, 0),
  };
}

export function breakfastDay(sales: BreakfastSale[], date: string, types: RoomTypeInfo[] = []) {
  return summarize(date, breakfastRows(sales, date, types));
}

export function breakfastWeek(sales: BreakfastSale[], from: string, types: RoomTypeInfo[] = [], days = 7) {
  return Array.from({ length: days }, (_, i) => breakfastDay(sales, addDaysVN(from, i), types));
}
