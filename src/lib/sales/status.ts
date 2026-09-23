import { SALE_SOURCE_GROUPS } from "../constants";
import type { SaleOrigin, SaleSource, SaleStatus } from "../types";
import { ACTIVE_SALE_STATUSES, SALE_SOURCES } from "../types";

const OTA_SOURCES = new Set<string>(SALE_SOURCE_GROUPS.find((group) => group.label === "OTA")?.values ?? []);

export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string) {
  return aIn < bOut && bIn < aOut;
}

export function occupiesNight(checkIn: string, checkOut: string, date: string) {
  return checkIn <= date && date < checkOut;
}

export function isActiveSaleStatus(status: string): status is SaleStatus {
  return ACTIVE_SALE_STATUSES.includes(status as SaleStatus);
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

export function isOtaDebt(source: string | null | undefined, mode?: string | null) {
  return isOtaSource(source) && mode !== "hotel";
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
