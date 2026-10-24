import { SALE_SOURCE_GROUPS } from "../constants";
import type { SaleOrigin, SaleSource, SaleStatus } from "../types";
import { ACTIVE_SALE_STATUSES, SALE_SOURCES } from "../types";
import { nightlyNetFromLine } from "./quote";

const OTA_SOURCES = new Set<string>(SALE_SOURCE_GROUPS.find((group) => group.label === "OTA")?.values ?? []);

export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string) {
  return aIn < bOut && bIn < aOut;
}

export function occupiesNight(checkIn: string, checkOut: string, date: string) {
  return checkIn <= date && date < checkOut;
}

export function summarizeSalesNight<
  Room extends { id: string; opsStatus: string },
  Sale extends { id: string; roomId: string; status: string; checkIn: string; checkOut: string },
>(
  rooms: Room[],
  sales: Sale[],
  date: string,
  lineById?: Map<string, { nights: number; total: number }>,
) {
  const nightSales = sales.filter((sale) => isActiveSaleStatus(sale.status) && occupiesNight(sale.checkIn, sale.checkOut, date));
  const byRoom = new Map(nightSales.map((sale) => [sale.roomId, sale]));
  let vacant = 0;
  let reserved = 0;
  let inhouse = 0;
  let ooo = 0;
  for (const room of rooms) {
    if (room.opsStatus === "ooo") {
      ooo += 1;
      continue;
    }
    const sale = byRoom.get(room.id);
    if (!sale) vacant += 1;
    else if (sale.status === "inhouse") inhouse += 1;
    else reserved += 1;
  }
  const revenue = nightSales.reduce((sum, sale) => sum + nightlyNetFromLine(lineById?.get(sale.id)), 0);
  return { vacant, reserved, inhouse, ooo, sold: reserved + inhouse, revenue, nightSales };
}

export function isActiveSaleStatus(status: string): status is SaleStatus {
  return ACTIVE_SALE_STATUSES.includes(status as SaleStatus);
}

export function billableSaleRows<T extends { status: string }>(rooms: T[]) {
  const active = rooms.filter((row) => isActiveSaleStatus(row.status));
  return active.length ? active : rooms;
}

export function isGanttSaleStatus(status: string): status is SaleStatus {
  return status === "reserved" || status === "inhouse" || status === "departed";
}

export function isSaleOrigin(value: string): value is SaleOrigin {
  return value === "ops" || value === "ezcloud";
}

export function isSaleSource(value: string): value is SaleSource {
  return (SALE_SOURCES as readonly string[]).includes(value);
}

export function isOtaSource(value: string | null | undefined) {
  return OTA_SOURCES.has(String(value || ""));
}

const OTA_DEBT_BY_DEFAULT = new Set(["agoda", "traveloka", "trip"]);

export function otaDebtByDefault(source: string | null | undefined) {
  return OTA_DEBT_BY_DEFAULT.has(String(source || ""));
}

export function isOtaDebt(source: string | null | undefined, mode?: string | null) {
  return isOtaSource(source) && mode !== "hotel";
}

export type OtaMoneySplitInput = {
  source?: string | null;
  otaPaymentMode?: string | null;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  deposit?: number | null;
  refunded?: number | null;
  /** Guest inflows (deposit/checkin/payment) net of refund. When set with otaCollected, preferred over deposit heuristic. */
  guestCollected?: number | null;
  /** OTA settle inflows */
  otaCollected?: number | null;
};

export type OtaMoneySplit = {
  otaDebt: boolean;
  roomTotal: number;
  extrasTotal: number;
  collected: number;
  due: number;
  /** Room amount still owed by OTA partner */
  otaDue: number;
  /** Extras still owed by guest at the hotel (cash / personal / company) */
  guestDue: number;
  guestCollected: number;
  otaCollected: number;
};

/** OTA công nợ: tiền phòng do OTA trả; phụ thu vẫn thu khách tại KS. */
export function otaMoneySplit(input: OtaMoneySplitInput): OtaMoneySplit {
  const roomTotal = Math.max(0, Math.round(input.roomTotal || 0));
  const extrasTotal = Math.max(0, Math.round(input.extrasTotal || 0));
  const refunded = Math.max(0, Math.round(input.refunded || 0));
  const deposit = Math.max(0, Math.round(input.deposit || 0));
  const hasKindSplit = input.guestCollected != null || input.otaCollected != null;
  const fromDeposit = Math.max(0, deposit - refunded);
  const guestCollected = hasKindSplit
    ? Math.max(0, Math.round(input.guestCollected || 0))
    : 0;
  const otaCollected = hasKindSplit
    ? Math.max(0, Math.round(input.otaCollected || 0))
    : 0;
  const collected = hasKindSplit ? guestCollected + otaCollected : fromDeposit;
  const due = Math.max(0, roomTotal + extrasTotal - collected);
  const debt = isOtaDebt(input.source, input.otaPaymentMode);

  if (!debt) {
    return {
      otaDebt: false,
      roomTotal,
      extrasTotal,
      collected,
      due,
      otaDue: 0,
      guestDue: due,
      guestCollected: collected,
      otaCollected: 0,
    };
  }

  const guestPaid = hasKindSplit ? guestCollected : Math.min(collected, extrasTotal);
  const otaPaid = hasKindSplit ? otaCollected : Math.max(0, collected - extrasTotal);

  return {
    otaDebt: true,
    roomTotal,
    extrasTotal,
    collected,
    due,
    otaDue: Math.max(0, roomTotal - otaPaid),
    guestDue: Math.max(0, extrasTotal - guestPaid),
    guestCollected: guestPaid,
    otaCollected: otaPaid,
  };
}

export function guestCheckoutDue(
  due: number | null | undefined,
  source?: string | null,
  otaPaymentMode?: string | null,
  opts?: Omit<OtaMoneySplitInput, "source" | "otaPaymentMode">,
) {
  if (!isOtaDebt(source, otaPaymentMode)) return Math.max(0, Math.round(due || 0));
  if (!opts) return 0;
  return otaMoneySplit({ source, otaPaymentMode, ...opts }).guestDue;
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
  if (compact === "trip" || compact.startsWith("tripcom") || compact.includes("ctrip")) return "trip";
  if (compact.includes("expedia") || compact.includes("hotelscom")) return "expedia";
  if (compact.includes("airbnb")) return "airbnb";
  if (compact.includes("booking")) return "booking";
  if (compact.includes("ezcloud") || compact.includes("websitekhachsan")) return "ezcloud";
  if (compact.includes("zalo")) return "zalo";
  if (compact.includes("facebook") || compact === "fb") return "facebook";
  if (compact.includes("tiktok")) return "tiktok";
  if (compact.includes("walk") || compact.includes("vanglai") || compact.includes("walkin")) return "walk_in";
  if (compact.includes("phone") || compact.includes("dienthoai")) return "phone";
  if (compact.includes("company") || compact.includes("congty") || compact.includes("corporate") || compact.includes("doan")) return "company";
  if (compact.includes("ota")) return "ota";
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
