import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "../constants";
import { formatDateNumeric } from "../datetime";
import { matchesSearchText } from "../search-text";
import type { SaleOrigin, SaleSource, SaleStatus } from "../types";

export type BookingSearchRow = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  pmsCode?: string | null;
  notes?: string | null;
  roomLabel: string;
  typeLabel?: string | null;
  source: string;
  origin?: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  extras?: { name: string }[];
  rooms?: { room?: { number?: string | null; type?: string | null } | null }[];
};

export function bookingSearchText(row: BookingSearchRow) {
  const phone = row.guestPhone?.trim() || "";
  const numbers = (row.rooms || []).map((item) => item.room?.number?.trim()).filter((value): value is string => Boolean(value));
  const types = (row.rooms || []).map((item) => item.room?.type?.trim()).filter((value): value is string => Boolean(value));
  const extras = (row.extras || []).map((item) => item.name.trim()).filter(Boolean);
  const source = row.source as SaleSource;
  const origin = (row.origin || "ops") as SaleOrigin;
  const status = row.status as SaleStatus;
  return [
    row.id,
    row.guestName,
    phone,
    phone.replace(/\D/g, ""),
    row.pmsCode,
    row.notes,
    row.roomLabel,
    row.typeLabel,
    ...numbers,
    ...numbers.map((number) => `P.${number}`),
    ...types,
    row.source,
    SALE_SOURCE_LABEL[source] || row.source,
    row.origin,
    SALE_ORIGIN_LABEL[origin] || row.origin,
    row.status,
    SALE_STATUS_LABEL[status] || row.status,
    row.checkIn,
    row.checkOut,
    formatDateNumeric(row.checkIn),
    formatDateNumeric(row.checkOut),
    ...extras,
  ]
    .filter(Boolean)
    .join(" ");
}

export function matchesBookingSearch(row: BookingSearchRow, query: string) {
  return matchesSearchText(bookingSearchText(row), query);
}
