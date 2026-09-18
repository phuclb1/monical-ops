import { addDaysVN, prevDate, WEEKDAYS, weekdayISO } from "./datetime";
import { bookingKey, occupiesNight } from "./sales";

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
  adults: number;
  children: number;
  servings: number;
};

export type BreakfastDay = {
  date: string;
  weekday: (typeof WEEKDAYS)[number];
  rows: BreakfastRow[];
  rooms: number;
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

export function roomTypeLabel(typeName: string, types: { name: string; code: string }[]) {
  const pretty = titleType(typeName || "—");
  const hit = types.find((row) => row.name === typeName);
  if (!hit) return pretty;
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

function kindOf(status: string): BreakfastKind {
  return status === "reserved" ? "expected" : "checked_in";
}

export function eatsBreakfastOn(sale: BreakfastSale, date: string) {
  if (sale.status === "cancelled" || sale.status === "no_show") return false;
  if (sale.breakfast === false) return false;
  return occupiesNight(sale.checkIn, sale.checkOut, prevDate(date));
}

export function breakfastRows(
  sales: BreakfastSale[],
  date: string,
  types: { name: string; code: string }[] = [],
): BreakfastRow[] {
  return sales
    .filter((sale) => eatsBreakfastOn(sale, date))
    .map((sale) => {
      const adults = Math.max(0, sale.adults || 0);
      const children = Math.max(0, sale.children || 0);
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
        adults,
        children,
        servings: adults + children,
      };
    })
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "vi") || a.guestName.localeCompare(b.guestName, "vi"));
}

function summarize(date: string, rows: BreakfastRow[]): BreakfastDay {
  const iso = weekdayISO(date);
  const weekday = WEEKDAYS.find((day) => day.iso === iso) ?? WEEKDAYS[0];
  return {
    date,
    weekday,
    rows,
    rooms: rows.length,
    adults: rows.reduce((sum, row) => sum + row.adults, 0),
    children: rows.reduce((sum, row) => sum + row.children, 0),
    servings: rows.reduce((sum, row) => sum + row.servings, 0),
    checkedIn: rows.filter((row) => row.kind === "checked_in").reduce((sum, row) => sum + row.servings, 0),
    expected: rows.filter((row) => row.kind === "expected").reduce((sum, row) => sum + row.servings, 0),
  };
}

export function breakfastDay(sales: BreakfastSale[], date: string, types: { name: string; code: string }[] = []) {
  return summarize(date, breakfastRows(sales, date, types));
}

export function breakfastWeek(sales: BreakfastSale[], from: string, types: { name: string; code: string }[] = [], days = 7) {
  return Array.from({ length: days }, (_, i) => breakfastDay(sales, addDaysVN(from, i), types));
}
