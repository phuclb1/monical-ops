import { isHolidayNight, weekdayISO } from "../datetime";
import type { DiscountKind } from "../types";
import { parseMoney } from "./money";

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
  if (isHolidayNight(date) && type.weekendRate) return type.weekendRate;
  return type.baseRate || 0;
}

export function parseDiscountKind(value: FormDataEntryValue | string | null | undefined): DiscountKind {
  const kind = String(value || "none");
  if (kind === "percent" || kind === "amount") return kind;
  return "none";
}

export function parseDiscountValue(kind: FormDataEntryValue | string | null | undefined, raw: FormDataEntryValue | string | null | undefined) {
  if (parseDiscountKind(kind) !== "percent") return parseMoney(raw);
  const text = String(raw ?? "").trim().replace(/%/g, "").replace(",", ".");
  const n = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function asDiscount(kind: string | null | undefined, value: number | null | undefined) {
  const discountKind = parseDiscountKind(kind);
  const discountValue = Math.max(0, Math.round(value || 0));
  if (discountKind === "percent" && discountValue > 100) {
    return { discountKind: "amount" as const, discountValue };
  }
  return { discountKind, discountValue: discountKind === "none" ? 0 : discountValue };
}

export function normalizeDiscount(kind: string | null | undefined, value: number | null | undefined) {
  const discountKind = parseDiscountKind(kind);
  const discountValue = Math.max(0, Math.round(value || 0));
  if (discountKind === "percent" && discountValue > 100) {
    throw new Error("Chiết khấu tối đa 100%. Nếu giảm theo tiền, chọn Số tiền.");
  }
  return { discountKind, discountValue: discountKind === "none" ? 0 : discountValue };
}

type QuoteLineInput = {
  rate: number;
  checkIn: string;
  checkOut: string;
  breakfast?: boolean | null;
  discountKind?: string | null;
  discountValue?: number | null;
};

export function breakfastOffAmount(_nights: number, _breakfast?: boolean | null) {
  return 0;
}

export function nightlyCharge(rate: number, _breakfast?: boolean | null) {
  return Math.max(0, Math.round(rate || 0));
}

function lineDiscount(subtotal: number, kind: string | null | undefined, value: number | null | undefined) {
  const { discountKind, discountValue } = asDiscount(kind, value);
  if (discountKind === "percent") return Math.round(subtotal * discountValue / 100);
  if (discountKind === "amount") return discountValue;
  return 0;
}

export function bookingQuote<T extends QuoteLineInput>(rooms: T[]) {
  const lines = rooms.map((row) => {
    const nights = Math.max(0, nightsBetween(row.checkIn, row.checkOut));
    const breakfast = row.breakfast !== false;
    const breakfastOff = breakfastOffAmount(nights, breakfast);
    const gross = Math.max(0, Math.round(row.rate || 0) * nights);
    const subtotal = Math.max(0, gross - breakfastOff);
    const { discountKind, discountValue } = asDiscount(row.discountKind, row.discountValue);
    const discount = Math.min(subtotal, Math.max(0, lineDiscount(subtotal, discountKind, discountValue)));
    return { nights, breakfast, breakfastOff, gross, subtotal, discount, total: subtotal - discount, discountKind, discountValue };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = lines.reduce((sum, line) => sum + line.discount, 0);
  const breakfastOff = lines.reduce((sum, line) => sum + line.breakfastOff, 0);
  const firstCk = lines.find((line) => line.discountKind !== "none") || lines[0];
  return {
    nights: lines.reduce((max, line) => Math.max(max, line.nights), 0),
    subtotal,
    discount,
    breakfastOff,
    total: subtotal - discount,
    discountKind: firstCk?.discountKind || "none",
    discountValue: firstCk?.discountValue || 0,
    lines: lines.map((line) => ({
      nights: line.nights,
      breakfast: line.breakfast,
      breakfastOff: line.breakfastOff,
      gross: line.gross,
      subtotal: line.subtotal,
      discount: line.discount,
      total: line.total,
      discountKind: line.discountKind,
      discountValue: line.discountValue,
    })),
  };
}

export function ganttSpan(checkIn: string, checkOut: string, from: string, days: number) {
  const checkInCol = nightsBetween(from, checkIn);
  const checkOutCol = nightsBetween(from, checkOut);
  const start = Math.max(0, checkInCol + 0.5);
  const end = Math.min(days, checkOutCol + 0.5);
  const nightStart = Math.max(0, checkInCol);
  const nightEnd = Math.min(days, checkOutCol);
  if (end <= start) return null;
  return { start, end, nightStart, nightEnd };
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

export { isHolidayNight };
