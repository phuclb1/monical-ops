import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "./datetime";
import { audit } from "./repos";
import { syncBookingMoney } from "./repos/sales/money-sync";
import { catalogRate, clampBreakfastPax, clampRoomAdults, isActiveSaleStatus, normalizeDiscount, parseSaleSource, rangesOverlap, applyPaidAmount, roomAdultCap, salePaid } from "./sales";
import type { SaleOrigin, SaleStatus, StayStatus } from "./types";
import { SALE_STATUSES, STAY_STATUSES } from "./types";

export const INGEST_ACTOR_ID = "ingest-agent";

export type IngestBooking = {
  pmsCode: string;
  roomNumber?: string | null;
  guestName: string;
  guestPhone?: string | null;
  status?: string | null;
  arrivalDate: string;
  departureDate: string;
  adults?: number;
  children?: number;
  breakfast?: boolean;
  origin?: string | null;
  source?: string | null;
  platform?: string | null;
  channel?: string | null;
  rate?: number;
  discountKind?: string | null;
  discountValue?: number;
  deposit?: number;
  notes?: string | null;
  pmsCheckin?: boolean;
  pmsCheckout?: boolean;
  invoiceRequested?: boolean;
  invoiceOk?: boolean;
};

export type IngestResult = {
  pmsCode: string;
  stay: "created" | "updated" | "skipped";
  sale: "created" | "updated" | "skipped";
  error?: string;
};

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function asStayStatus(raw: string | null | undefined): StayStatus {
  const value = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "reserved" || value === "booked" || value === "confirm" || value === "confirmed") return "arriving";
  if (value === "checked_in" || value === "checkin" || value === "occupied" || value === "in_house") return "inhouse";
  if (value === "due_out" || value === "dueout") return "departing";
  if (value === "checked_out" || value === "checkout") return "departed";
  if (value === "cancel" || value === "canceled" || value === "cancelled") return "no_show";
  if ((STAY_STATUSES as readonly string[]).includes(value)) return value as StayStatus;
  return "arriving";
}

function asSaleStatus(raw: string | null | undefined, stay: StayStatus): SaleStatus {
  const value = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "cancel" || value === "canceled" || value === "cancelled") return "cancelled";
  if ((SALE_STATUSES as readonly string[]).includes(value)) return value as SaleStatus;
  if (stay === "arriving") return "reserved";
  if (stay === "no_show") return "no_show";
  if (stay === "inhouse" || stay === "departing") return "inhouse";
  if (stay === "departed") return "departed";
  return "reserved";
}

export function ingestSecret() {
  const dedicated = process.env.INGEST_SECRET?.trim();
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV === "production") return "";
  return process.env.SESSION_SECRET?.trim() || "ops-monical-dev-secret-change-me";
}

export function ingestAuthorized(request: Request) {
  const expected = ingestSecret();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-ingest-secret")?.trim() || "";
  const given = bearer || alt;
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function ingestPmsBookings(bookings: IngestBooking[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const raw of bookings) {
    results.push(await ingestOne(raw));
  }
  return results;
}

async function ingestOne(raw: IngestBooking): Promise<IngestResult> {
  const pmsCode = String(raw.pmsCode || "").trim();
  const guestName = String(raw.guestName || "").trim();
  if (!pmsCode) return { pmsCode: "", stay: "skipped", sale: "skipped", error: "Thiếu pmsCode" };
  if (!guestName) return { pmsCode, stay: "skipped", sale: "skipped", error: "Thiếu tên khách" };
  if (!isoDate(raw.arrivalDate) || !isoDate(raw.departureDate) || raw.departureDate <= raw.arrivalDate) {
    return { pmsCode, stay: "skipped", sale: "skipped", error: "Ngày nhận / trả không hợp lệ" };
  }

  const stayStatus = asStayStatus(raw.status);
  const saleStatus = asSaleStatus(raw.status, stayStatus);
  const platform = parseSaleSource(raw.platform || raw.channel || raw.source);
  const origin: SaleOrigin = "ezcloud";
  const roomNumber = String(raw.roomNumber || "").replace(/^p\.?/i, "").trim();
  const db = await getDb();
  const room = roomNumber
    ? (await db.select().from(t.rooms).where(eq(t.rooms.number, roomNumber)).limit(1))[0]
    : null;
  if (roomNumber && !room) {
    return { pmsCode, stay: "skipped", sale: "skipped", error: `Không thấy phòng ${roomNumber}` };
  }

  const now = nowISO();
  const { discountKind, discountValue } = normalizeDiscount(raw.discountKind || "none", raw.discountValue || 0);
  const roomType = room
    ? (await db.select().from(t.roomTypes).where(eq(t.roomTypes.name, room.type)).limit(1))[0]
    : null;
  const cap = room ? roomAdultCap(room.type, roomType?.adults) : null;

  if (!room) {
    return { pmsCode, stay: "skipped", sale: "skipped", error: "Không có số phòng — chưa gán sơ đồ bán" };
  }

  const saleRows = await db.select().from(t.roomSales).where(eq(t.roomSales.pmsCode, pmsCode));
  const saleRow = saleRows.find((row) => row.roomId === room.id);
  const clash = (await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, room.id))).find(
    (sale) =>
      sale.id !== saleRow?.id &&
      isActiveSaleStatus(sale.status) &&
      isActiveSaleStatus(saleStatus) &&
      rangesOverlap(raw.arrivalDate, raw.departureDate, sale.checkIn, sale.checkOut),
  );
  if (clash) {
    return {
      pmsCode,
      stay: "skipped",
      sale: "skipped",
      error: `P.${room.number} đã bán ${clash.checkIn} → ${clash.checkOut} (${clash.guestName})`,
    };
  }

  const adults = cap ? clampRoomAdults(raw.adults || saleRow?.adults || cap, cap) : Math.max(1, raw.adults || saleRow?.adults || 1);
  const children = Math.max(0, raw.children ?? saleRow?.children ?? 0);
  const breakfast = raw.breakfast ?? saleRow?.breakfast ?? true;
  const breakfastPax = clampBreakfastPax(adults, children, saleRow?.breakfastAdults, saleRow?.breakfastChildren, breakfast !== false);
  const salePayload = {
    roomId: room.id,
    guestName,
    guestPhone: raw.guestPhone?.trim() || saleRow?.guestPhone || null,
    origin: saleRow?.origin === "ops" ? "ops" : origin,
    source: platform,
    invoiceRequested: raw.invoiceRequested ?? saleRow?.invoiceRequested ?? false,
    status: saleStatus,
    checkIn: raw.arrivalDate,
    checkOut: raw.departureDate,
    adults,
    children,
    rate: Math.max(0, raw.rate ?? saleRow?.rate ?? catalogRate(roomType ?? undefined, raw.arrivalDate)),
    discountKind,
    discountValue,
    ...applyPaidAmount(salePaid(saleRow || {}), Math.max(0, raw.deposit ?? saleRow?.deposit ?? 0), "personal"),
    breakfast,
    breakfastAdults: breakfastPax.adults,
    breakfastChildren: breakfastPax.children,
    pmsCode,
    notes: raw.notes?.trim() || saleRow?.notes || null,
    updatedAt: now,
    updatedBy: INGEST_ACTOR_ID,
  };

  if (saleRow) {
    await db.update(t.roomSales).set(salePayload).where(eq(t.roomSales.id, saleRow.id));
    await audit(INGEST_ACTOR_ID, "room_sale", saleRow.id, "ingest", saleRow, salePayload);
    await syncBookingMoney(saleRow.bookingId || saleRow.id);
    return { pmsCode, stay: "skipped", sale: "updated" };
  }

  const saleId = nid();
  const bookingId = saleRows.find((row) => row.bookingId)?.bookingId || saleRows[0]?.bookingId || saleRows[0]?.id || saleId;
  await db.insert(t.roomSales).values({
    id: saleId,
    bookingId,
    ...salePayload,
    createdAt: now,
    createdBy: INGEST_ACTOR_ID,
  });
  await audit(INGEST_ACTOR_ID, "room_sale", saleId, "ingest", null, salePayload);
  await syncBookingMoney(bookingId);
  return { pmsCode, stay: "skipped", sale: "created" };
}
