import { addDaysVN, isHolidayNight, weekdayISO } from "./datetime";
import type { DiscountKind, PaymentMethod, SaleOrigin, SaleSource, SaleStatus } from "./types";
import { ACTIVE_SALE_STATUSES, PAYMENT_METHODS, SALE_SOURCES } from "./types";

export function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T12:00:00+07:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00+07:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function isWeekendNight(isoDate: string) {
  return weekdayISO(isoDate) >= 5;
}

export { isHolidayNight };

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

export function quoteLinesBySaleId<T extends QuoteLineInput & { id: string; bookingId?: string | null }>(sales: T[]) {
  const map = new Map<string, ReturnType<typeof bookingQuote>["lines"][number]>();
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

export function parkingLabel(cars?: number | null, bikes?: number | null) {
  const parts: string[] = [];
  if (cars) parts.push(`${cars} ô tô`);
  if (bikes) parts.push(`${bikes} xe máy`);
  return parts.join(" · ") || "—";
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

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function parsePaymentMethod(value: FormDataEntryValue | string | null | undefined): PaymentMethod {
  const raw = String(value || "");
  if (raw === "cash") return "cash";
  if (raw === "company") return "company";
  return "personal";
}

type PaidSplit = {
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
  deposit?: number | null;
};

export function salePaid(row: PaidSplit) {
  const cashPaid = Math.max(0, Math.round(row.cashPaid || 0));
  const transferPaid = Math.max(0, Math.round(row.transferPaid || 0));
  const companyPaid = Math.max(0, Math.round(row.companyPaid || 0));
  const deposit = Math.max(0, Math.round(row.deposit || 0));
  const split = cashPaid + transferPaid + companyPaid;
  if (split === 0 && deposit > 0) {
    return { cashPaid: 0, transferPaid: deposit, companyPaid: 0, deposit };
  }
  return { cashPaid, transferPaid, companyPaid, deposit: split || deposit };
}

export function paidFromMethod(amount: number, method: PaymentMethod) {
  const deposit = Math.max(0, Math.round(amount || 0));
  if (method === "cash") return { cashPaid: deposit, transferPaid: 0, companyPaid: 0, deposit };
  if (method === "company") return { cashPaid: 0, transferPaid: 0, companyPaid: deposit, deposit };
  return { cashPaid: 0, transferPaid: deposit, companyPaid: 0, deposit };
}

export function applyPaidAmount(current: PaidSplit, nextDeposit: number, method: PaymentMethod) {
  const paid = salePaid(current);
  const next = Math.max(0, Math.round(nextDeposit || 0));
  if (next === paid.deposit) return paid;
  if (next > paid.deposit) {
    const extra = next - paid.deposit;
    if (method === "cash") return { ...paid, cashPaid: paid.cashPaid + extra, deposit: next };
    if (method === "company") return { ...paid, companyPaid: paid.companyPaid + extra, deposit: next };
    return { ...paid, transferPaid: paid.transferPaid + extra, deposit: next };
  }
  let need = paid.deposit - next;
  const buckets = {
    cash: paid.cashPaid,
    personal: paid.transferPaid,
    company: paid.companyPaid,
  };
  const order: PaymentMethod[] =
    method === "cash" ? ["cash", "personal", "company"] : method === "company" ? ["company", "personal", "cash"] : ["personal", "company", "cash"];
  for (const key of order) {
    if (need <= 0) break;
    const take = Math.min(buckets[key], need);
    buckets[key] -= take;
    need -= take;
  }
  return {
    cashPaid: Math.max(0, buckets.cash),
    transferPaid: Math.max(0, buckets.personal),
    companyPaid: Math.max(0, buckets.company),
    deposit: next,
  };
}

export function primaryPaymentMethod(row: PaidSplit): PaymentMethod {
  const paid = salePaid(row);
  if (paid.companyPaid >= paid.transferPaid && paid.companyPaid >= paid.cashPaid && paid.companyPaid > 0) return "company";
  if (paid.cashPaid >= paid.transferPaid && paid.cashPaid > 0) return "cash";
  return "personal";
}

export function paidNote(row: PaidSplit) {
  const paid = salePaid(row);
  const parts: string[] = [];
  if (paid.companyPaid) parts.push(`CK công ty ${formatVnd(paid.companyPaid)}`);
  if (paid.transferPaid) parts.push(`CK cá nhân ${formatVnd(paid.transferPaid)}`);
  if (paid.cashPaid) parts.push(`tiền mặt ${formatVnd(paid.cashPaid)}`);
  return parts.join(" · ");
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
  const checkInCol = nightsBetween(from, checkIn);
  const checkOutCol = nightsBetween(from, checkOut);
  const start = Math.max(0, checkInCol + 0.5);
  const end = Math.min(days, checkOutCol + 0.5);
  const nightStart = Math.max(0, checkInCol);
  const nightEnd = Math.min(days, checkOutCol);
  if (end <= start) return null;
  return { start, end, nightStart, nightEnd };
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
  if (compact.includes("zalo")) return "zalo";
  if (compact.includes("facebook") || compact === "fb") return "facebook";
  if (compact.includes("walk") || compact.includes("vanglai") || compact.includes("walkin")) return "walk_in";
  if (compact.includes("phone") || compact.includes("dienthoai")) return "phone";
  if (compact.includes("company") || compact.includes("congty") || compact.includes("corporate") || compact.includes("doan")) return "company";
  if (compact.includes("ota") || compact.includes("tiktok")) return "ota";
  return "ota";
}

export function formatOpsBookingCode(seq: number, month: number | string) {
  const mm = String(month).padStart(2, "0");
  return `BK-${mm}-${Math.max(1, Math.round(seq))}`;
}

export function parseOpsBookingCode(code: string | null | undefined) {
  const value = String(code || "").trim();
  const next = value.match(/^BK-(\d{1,2})-(\d+)$/i);
  if (next) return { month: Number(next[1]), seq: Number(next[2]) };
  const legacy = value.match(/^BK-(\d+)\/(\d{1,2})$/i);
  if (legacy) return { seq: Number(legacy[1]), month: Number(legacy[2]) };
  return null;
}

export function isOpsBookingCode(code: string | null | undefined) {
  const value = String(code || "").trim();
  if (!value) return false;
  if (/^OPS-/i.test(value)) return true;
  return Boolean(parseOpsBookingCode(value));
}

export function isLegacyOpsBookingCode(code: string | null | undefined) {
  const value = String(code || "").trim();
  if (!value) return false;
  if (/^OPS-/i.test(value)) return true;
  return /^BK-\d+\/\d{1,2}$/i.test(value);
}

export function bookingKey(sale: { id: string; bookingId?: string | null }) {
  return sale.bookingId || sale.id;
}

export function clampStayPax(adults?: number | null, children?: number | null) {
  return {
    adults: Math.max(1, Math.round(Number(adults) || 1)),
    children: Math.max(0, Math.round(Number(children) || 0)),
  };
}

export function clampBreakfastPax(
  stayAdults: number,
  stayChildren: number,
  breakfastAdults?: number | null,
  breakfastChildren?: number | null,
  hasBreakfast = true,
) {
  if (!hasBreakfast) return { adults: 0, children: 0 };
  const capA = Math.max(0, stayAdults);
  const capC = Math.max(0, stayChildren);
  const rawA = breakfastAdults == null ? capA : Math.round(Number(breakfastAdults) || 0);
  const rawC = breakfastChildren == null ? capC : Math.round(Number(breakfastChildren) || 0);
  return {
    adults: Math.min(capA, Math.max(0, rawA)),
    children: Math.min(capC, Math.max(0, rawC)),
  };
}

type PaxRoom = {
  adults?: number | null;
  children?: number | null;
  breakfast?: boolean | null;
  breakfastAdults?: number | null;
  breakfastChildren?: number | null;
};

export function bookingStayPax(rooms: PaxRoom[]) {
  const first = rooms[0];
  return { adults: Math.max(0, first?.adults || 0), children: Math.max(0, first?.children || 0) };
}

export function bookingBreakfastPax(rooms: PaxRoom[]) {
  const stay = bookingStayPax(rooms);
  const eating = rooms.filter((row) => row.breakfast !== false);
  if (!eating.length) return { adults: 0, children: 0 };
  const sample = eating.find((row) => row.breakfastAdults != null || row.breakfastChildren != null) ?? eating[0];
  return clampBreakfastPax(stay.adults, stay.children, sample.breakfastAdults, sample.breakfastChildren, true);
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
