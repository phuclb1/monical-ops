import { addDaysVN, weekdayISO } from "./datetime";
import type { DiscountKind, SaleOrigin, SaleSource, SaleStatus } from "./types";
import { ACTIVE_SALE_STATUSES, SALE_SOURCES } from "./types";

export function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T12:00:00+07:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00+07:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function isWeekendNight(isoDate: string) {
  return weekdayISO(isoDate) >= 5;
}

export function catalogRate(type: { baseRate: number; weekendRate: number } | undefined, date: string) {
  if (!type) return 0;
  if (isWeekendNight(date) && type.weekendRate) return type.weekendRate;
  return type.baseRate || 0;
}

export function parseDiscountKind(value: FormDataEntryValue | string | null | undefined): DiscountKind {
  const kind = String(value || "none");
  if (kind === "percent" || kind === "amount") return kind;
  return "none";
}

export function normalizeDiscount(kind: string | undefined, value: number | undefined) {
  const discountKind = parseDiscountKind(kind);
  const discountValue = Math.max(0, Math.round(value || 0));
  if (discountKind === "percent" && discountValue > 100) throw new Error("Chiết khấu tối đa 100%");
  return { discountKind, discountValue: discountKind === "none" ? 0 : discountValue };
}

type QuoteLineInput = {
  rate: number;
  checkIn: string;
  checkOut: string;
  discountKind?: string | null;
  discountValue?: number | null;
};

function allocateAmount(weights: number[], total: number) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (weight / sum) * total);
  const floors = raw.map((value) => Math.floor(value));
  let remain = total - floors.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = [...floors];
  for (const item of order) {
    if (remain <= 0) break;
    out[item.index] += 1;
    remain -= 1;
  }
  return out;
}

export function bookingQuote<T extends QuoteLineInput>(rooms: T[]) {
  const lines = rooms.map((row) => {
    const nights = Math.max(0, nightsBetween(row.checkIn, row.checkOut));
    return { nights, subtotal: Math.max(0, row.rate) * nights };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const first = rooms[0];
  const { discountKind, discountValue } = normalizeDiscount(first?.discountKind || "none", first?.discountValue || 0);
  const raw =
    discountKind === "percent" ? Math.round(subtotal * discountValue / 100) : discountKind === "amount" ? discountValue : 0;
  const discount = Math.min(subtotal, Math.max(0, raw));
  const shares = allocateAmount(
    lines.map((line) => line.subtotal),
    discount,
  );
  return {
    nights: lines[0]?.nights || 0,
    subtotal,
    discount,
    total: subtotal - discount,
    discountKind,
    discountValue,
    lines: lines.map((line, index) => ({
      nights: line.nights,
      subtotal: line.subtotal,
      discount: shares[index] || 0,
      total: line.subtotal - (shares[index] || 0),
    })),
  };
}

export function quoteLinesBySaleId<T extends QuoteLineInput & { id: string; bookingId?: string | null }>(sales: T[]) {
  const map = new Map<string, { nights: number; subtotal: number; discount: number; total: number }>();
  for (const { rooms } of groupByBooking(sales)) {
    const quote = bookingQuote(rooms);
    rooms.forEach((room, index) => map.set(room.id, quote.lines[index]));
  }
  return map;
}

export function saleQuote(input: QuoteLineInput) {
  const quote = bookingQuote([input]);
  const line = quote.lines[0] || { nights: 0, subtotal: 0, discount: 0, total: 0 };
  return { ...line, discountKind: quote.discountKind, discountValue: quote.discountValue };
}

export function saleTotal(rate: number, checkIn: string, checkOut: string, discountKind?: string | null, discountValue?: number | null) {
  return saleQuote({ rate, checkIn, checkOut, discountKind, discountValue }).total;
}

export function nightlyNet(input: QuoteLineInput) {
  const quote = saleQuote(input);
  return quote.nights > 0 ? Math.round(quote.total / quote.nights) : 0;
}

export function nightlyNetFromLine(line: { nights: number; total: number } | undefined) {
  if (!line?.nights) return 0;
  return Math.round(line.total / line.nights);
}

export function parseMoney(value: FormDataEntryValue | string | null | undefined) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

export function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(value)))}₫`;
}

export function formatVndLetter(value: number) {
  return `VND ${new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)))}`;
}

export function bookingDisplayCode(booking: { pmsCode?: string | null; id: string }) {
  return booking.pmsCode?.trim() || booking.id;
}

export function bookingPdfFilename(booking: { pmsCode?: string | null; id: string }) {
  const raw = bookingDisplayCode(booking);
  const safe = raw.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "booking";
  return `${safe}.pdf`;
}

export function bookingDue(total: number, deposit: number) {
  return Math.max(0, Math.round(total || 0) - Math.max(0, Math.round(deposit || 0)));
}

export function discountLabel(kind: string | null | undefined, value: number | null | undefined) {
  if (kind === "percent" && value) return `${value}%`;
  if (kind === "amount" && value) return formatVnd(value);
  return "Không";
}

export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string) {
  return aIn < bOut && bIn < aOut;
}

export function occupiesNight(checkIn: string, checkOut: string, date: string) {
  return checkIn <= date && date < checkOut;
}

export function ganttSpan(checkIn: string, checkOut: string, from: string, days: number) {
  const start = Math.max(0, nightsBetween(from, checkIn));
  const end = Math.min(days, nightsBetween(from, checkOut));
  if (end <= start) return null;
  return { start, end };
}

export function isActiveSaleStatus(status: string): status is SaleStatus {
  return ACTIVE_SALE_STATUSES.includes(status as SaleStatus);
}

export function isSaleOrigin(value: string): value is SaleOrigin {
  return value === "ops" || value === "ezcloud";
}

export function isSaleSource(value: string): value is SaleSource {
  return (SALE_SOURCES as readonly string[]).includes(value);
}

export function parseSaleSource(raw: string | null | undefined): SaleSource {
  const original = String(raw || "").trim().toLowerCase();
  if (isSaleSource(original)) return original;
  const compact = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s._-]+/g, "");
  if (compact.includes("agoda")) return "agoda";
  if (compact.includes("traveloka") || compact.includes("tvlk")) return "traveloka";
  if (compact.includes("expedia") || compact.includes("hotelscom")) return "expedia";
  if (compact.includes("airbnb")) return "airbnb";
  if (compact.includes("booking")) return "booking";
  if (compact.includes("ezcloud") || compact.includes("websitekhachsan")) return "ezcloud";
  if (compact.includes("walk") || compact.includes("vanglai") || compact.includes("walkin")) return "walk_in";
  if (compact.includes("phone") || compact.includes("dienthoai")) return "phone";
  if (compact.includes("company") || compact.includes("congty") || compact.includes("corporate") || compact.includes("doan")) return "company";
  if (compact.includes("ota") || compact.includes("tiktok") || compact.includes("facebook") || compact.includes("zalo")) return "ota";
  return "ota";
}

export function isOpsBookingCode(code: string | null | undefined) {
  return String(code || "").toUpperCase().startsWith("OPS-");
}

export function bookingKey(sale: { id: string; bookingId?: string | null }) {
  return sale.bookingId || sale.id;
}

export function roomMoveKind(
  fromType: string,
  toType: string,
  types: { name: string; sortOrder: number; baseRate?: number | null }[],
): "same" | "upgrade" | null {
  if (fromType === toType) return "same";
  const from = types.find((type) => type.name === fromType);
  const to = types.find((type) => type.name === toType);
  if (!from || !to) return null;
  if (to.sortOrder < from.sortOrder) return "upgrade";
  if ((to.baseRate || 0) > (from.baseRate || 0)) return "upgrade";
  return null;
}

export function rollupBookingStatus(statuses: string[]): SaleStatus {
  if (statuses.includes("inhouse")) return "inhouse";
  if (statuses.includes("reserved")) return "reserved";
  if (statuses.includes("departed")) return "departed";
  if (statuses.includes("no_show")) return "no_show";
  return "cancelled";
}

export function groupByBooking<T extends { id: string; bookingId?: string | null }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = bookingKey(row);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([id, rooms]) => ({ id, rooms }));
}

export function saleStatusToStay(status: string) {
  if (status === "inhouse") return "inhouse" as const;
  if (status === "departed") return "departed" as const;
  if (status === "cancelled" || status === "no_show") return "no_show" as const;
  return "arriving" as const;
}

export function defaultCheckout(checkIn: string) {
  return addDaysVN(checkIn, 1);
}
