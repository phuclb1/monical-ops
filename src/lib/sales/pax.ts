import { addDaysVN } from "../datetime";
import { defaultAdultsForRoomType } from "../rooms-catalog";
import type { SaleStatus } from "../types";
import { bookingQuote } from "./quote";
import { bookingKey } from "./status";

export function clampStayPax(adults?: number | null, children?: number | null) {
  return {
    adults: Math.max(1, Math.round(Number(adults) || 1)),
    children: Math.max(0, Math.round(Number(children) || 0)),
  };
}

export function roomAdultCap(typeName: string, configured?: number | null) {
  return defaultAdultsForRoomType(typeName, configured);
}

/** Adults for one room: default is the room-type cap, and the value cannot rise above it. */
export function clampRoomAdults(value: number | null | undefined, cap: number) {
  const ceiling = Math.max(1, Math.round(Number(cap)) || 1);
  if (value == null || !Number.isFinite(Number(value))) return ceiling;
  return Math.min(ceiling, Math.max(1, Math.round(Number(value))));
}

export function roomStayPax(cap: number, adults?: number | null, children?: number | null) {
  return {
    adults: clampRoomAdults(adults, cap),
    children: Math.max(0, Math.round(Number(children) || 0)),
  };
}

/** Spread a legacy booking-level adult count across rooms without passing each room's cap. */
export function splitBookingAdults(total: number, caps: number[]) {
  const limits = caps.map((cap) => Math.max(1, Math.round(Number(cap)) || 1));
  if (!limits.length) return [];
  const maxSum = limits.reduce((sum, cap) => sum + cap, 0);
  const minSum = limits.length;
  let left = Math.min(maxSum, Math.max(minSum, Math.round(Number(total)) || minSum));
  const out = limits.map(() => 1);
  left -= out.length;
  for (let i = 0; i < out.length && left > 0; i += 1) {
    const take = Math.min(limits[i] - out[i], left);
    out[i] += take;
    left -= take;
  }
  return out;
}

export function splitBookingChildren(total: number, count: number) {
  const n = Math.max(0, count);
  const safe = Math.max(0, Math.round(Number(total)) || 0);
  const out = Array.from({ length: n }, () => 0);
  if (!n || !safe) return out;
  const base = Math.floor(safe / n);
  let rem = safe - base * n;
  for (let i = 0; i < n; i += 1) {
    out[i] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
  }
  return out;
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

export function bookingStayPax(rooms: PaxRoom[]): { adults: number; children: number } {
  return rooms.reduce<{ adults: number; children: number }>(
    (sum, row) => ({
      adults: sum.adults + Math.max(0, Math.round(Number(row.adults) || 0)),
      children: sum.children + Math.max(0, Math.round(Number(row.children) || 0)),
    }),
    { adults: 0, children: 0 },
  );
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

export function quoteLinesBySaleId<T extends { id: string; bookingId?: string | null; rate: number; checkIn: string; checkOut: string; breakfast?: boolean | null; discountKind?: string | null; discountValue?: number | null }>(sales: T[]) {
  const map = new Map<string, ReturnType<typeof bookingQuote>["lines"][number]>();
  for (const { rooms } of groupByBooking(sales)) {
    const quote = bookingQuote(rooms);
    rooms.forEach((room, index) => map.set(room.id, quote.lines[index]));
  }
  return map;
}

export function saleStatusToStay(
  status: string,
  opts?: { checkOut?: string; date?: string },
) {
  if (status === "cancelled") return "departed" as const;
  if (status === "no_show") return "no_show" as const;
  if (status === "departed") return "departed" as const;
  if (status === "inhouse") {
    if (opts?.checkOut && opts?.date && opts.checkOut <= opts.date) return "departing" as const;
    return "inhouse" as const;
  }
  return "arriving" as const;
}

export function defaultCheckout(checkIn: string) {
  return addDaysVN(checkIn, 1);
}
