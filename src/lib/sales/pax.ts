import { addDaysVN } from "../datetime";
import type { SaleStatus } from "../types";
import { bookingQuote } from "./quote";
import { bookingKey } from "./status";

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

export function quoteLinesBySaleId<T extends { id: string; bookingId?: string | null; rate: number; checkIn: string; checkOut: string; breakfast?: boolean | null; discountKind?: string | null; discountValue?: number | null }>(sales: T[]) {
  const map = new Map<string, ReturnType<typeof bookingQuote>["lines"][number]>();
  for (const { rooms } of groupByBooking(sales)) {
    const quote = bookingQuote(rooms);
    rooms.forEach((room, index) => map.set(room.id, quote.lines[index]));
  }
  return map;
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
