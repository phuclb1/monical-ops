import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import {
  applyPaidAmount,
  clampBreakfastPax,
  clampStayPax,
  isActiveSaleStatus,
  normalizeDiscount,
  paidFromMethod,
  parsePaymentMethod,
  rangesOverlap,
} from "../../sales";

export type SaleInput = {
  roomId?: string;
  roomIds?: string[];
  bookingId?: string;
  guestName: string;
  guestPhone?: string;
  source: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  breakfastAdults?: number;
  breakfastChildren?: number;
  cars?: number;
  bikes?: number;
  rate: number;
  rates?: Record<string, number>;
  dates?: Record<string, { checkIn: string; checkOut: string }>;
  breakfasts?: Record<string, boolean>;
  discountKind?: string;
  discountValue?: number;
  discounts?: Record<string, { kind?: string; value?: number }>;
  deposit?: number;
  cashPaid?: number;
  transferPaid?: number;
  companyPaid?: number;
  paymentMethod?: string;
  pmsCode?: string;
  notes?: string;
  checkinNow?: boolean;
  origin?: string;
  extras?: { typeId?: string; name?: string; qty?: number; unitPrice?: number }[];
};

export function saleLineWindow(data: SaleInput, roomId: string) {
  const checkIn = data.dates?.[roomId]?.checkIn || data.checkIn;
  const checkOut = data.dates?.[roomId]?.checkOut || data.checkOut;
  const breakfast = data.breakfasts?.[roomId] ?? true;
  const rate = Math.max(0, data.rates?.[roomId] ?? data.rate);
  const { discountKind, discountValue } = normalizeDiscount(
    data.discounts?.[roomId]?.kind ?? data.discountKind,
    data.discounts?.[roomId]?.value ?? data.discountValue,
  );
  return { checkIn, checkOut, breakfast, rate, discountKind, discountValue };
}

export function salePax(data: Pick<SaleInput, "adults" | "children" | "breakfastAdults" | "breakfastChildren" | "breakfasts">, roomIds: string[]) {
  const stay = clampStayPax(data.adults, data.children);
  const hasBreakfast = roomIds.some((id) => data.breakfasts?.[id] !== false);
  const breakfast = clampBreakfastPax(stay.adults, stay.children, data.breakfastAdults, data.breakfastChildren, hasBreakfast);
  return { adults: stay.adults, children: stay.children, breakfastAdults: breakfast.adults, breakfastChildren: breakfast.children };
}

export function uniqueSaleRoomIds(data: SaleInput) {
  const ids = [...new Set([...(data.roomIds || []), data.roomId || ""].map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Chọn phòng");
  return ids;
}

export function paymentOf(
  data: SaleInput,
  current?: { cashPaid?: number | null; transferPaid?: number | null; companyPaid?: number | null; deposit?: number | null },
) {
  if (data.cashPaid != null || data.transferPaid != null || data.companyPaid != null) {
    const cashPaid = Math.max(0, Math.round(data.cashPaid || 0));
    const transferPaid = Math.max(0, Math.round(data.transferPaid || 0));
    const companyPaid = Math.max(0, Math.round(data.companyPaid || 0));
    return { cashPaid, transferPaid, companyPaid, deposit: cashPaid + transferPaid + companyPaid };
  }
  const method = parsePaymentMethod(data.paymentMethod);
  if (current) return applyPaidAmount(current, Math.max(0, data.deposit || 0), method);
  return paidFromMethod(Math.max(0, data.deposit || 0), method);
}

export function withSaleRoom<T extends { roomId: string }>(sale: T, rooms: { id: string; number: string; type: string; floor: number; opsStatus: string }[]) {
  return { ...sale, room: rooms.find((room) => room.id === sale.roomId) ?? null };
}

async function overlappingSale(roomId: string, checkIn: string, checkOut: string, exceptId?: string | string[]) {
  const db = await getDb();
  const skip = new Set(Array.isArray(exceptId) ? exceptId : exceptId ? [exceptId] : []);
  const rows = await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, roomId));
  return rows.find(
    (sale) =>
      !skip.has(sale.id) &&
      isActiveSaleStatus(sale.status) &&
      rangesOverlap(checkIn, checkOut, sale.checkIn, sale.checkOut),
  );
}

export async function assertSaleWindow(roomId: string, checkIn: string, checkOut: string, exceptId?: string | string[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new Error("Ngày nhận / trả không hợp lệ");
  }
  if (checkOut <= checkIn) throw new Error("Ngày trả phải sau ngày nhận");
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, roomId)).limit(1))[0];
  if (!room) throw new Error("Chọn phòng");
  if (room.opsStatus === "ooo") throw new Error(`P.${room.number} đang OOO, không bán`);
  const clash = await overlappingSale(roomId, checkIn, checkOut, exceptId);
  if (clash) {
    throw new Error(`P.${room.number} đã bán ${clash.checkIn} → ${clash.checkOut} (${clash.guestName})`);
  }
  return room;
}
