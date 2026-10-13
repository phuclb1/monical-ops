import { catalogRate, parseMoney, parseSaleSource } from "@/lib/sales";
import { bookingKey } from "@/lib/sales/status";
import { loadOpenApiToken } from "@/lib/open-api-settings";
import { listRooms, listRoomTypes } from "@/lib/repos/rooms";
import { getBooking, listBookings, listRoomSales } from "@/lib/repos/sales/queries";
import type { SaleInput } from "@/lib/repos/sales/helpers";
import type { SessionUser } from "@/lib/types";

export const OPEN_API_ACTOR_ID = "open-api-agent";

export function openApiActor(): SessionUser {
  return {
    id: OPEN_API_ACTOR_ID,
    username: "open-api",
    fullName: "Open API",
    role: "manager",
    departmentId: "",
    departmentCode: "management",
    sessionVersion: 0,
  };
}

export function isMachineBookingActor(actorId: string | null | undefined) {
  return actorId === OPEN_API_ACTOR_ID || actorId === "ingest-agent";
}

export function normalizeRoomNumber(value: string | null | undefined) {
  return String(value || "")
    .replace(/^p\.?/i, "")
    .trim();
}

export function envOpenApiSecret() {
  const dedicated = process.env.OPEN_API_SECRET?.trim();
  if (dedicated) return dedicated;
  const ingest = process.env.INGEST_SECRET?.trim();
  if (ingest) return ingest;
  if (process.env.NODE_ENV === "production") return "";
  return process.env.SESSION_SECRET?.trim() || "ops-monical-dev-secret-change-me";
}

export async function resolveOpenApiSecret() {
  try {
    const stored = await loadOpenApiToken();
    if (stored) return stored;
  } catch {
    // local tests / DB chưa sẵn
  }
  return envOpenApiSecret();
}

export function requestMatchesOpenApiSecret(request: Request, expected: string) {
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-open-api-secret")?.trim() || request.headers.get("x-ingest-secret")?.trim() || "";
  return secretMatches(expected, bearer || alt);
}

export async function openApiAuthorized(request: Request) {
  return requestMatchesOpenApiSecret(request, await resolveOpenApiSecret());
}

export function secretMatches(expected: string, given: string) {
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type OpenBookingRoom = {
  saleId: string;
  roomId: string;
  roomNumber: string | null;
  roomType: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  adults: number;
  children: number;
  breakfast: boolean;
};

export type OpenBooking = {
  id: string;
  pmsCode: string | null;
  guestName: string;
  guestPhone: string | null;
  origin: string;
  source: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  notes: string | null;
  total: number;
  deposit: number;
  rooms: OpenBookingRoom[];
  createdAt: string;
  updatedAt: string;
};

type BookingView = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

export function parseOpenSince(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  if (/^\d{10,13}$/.test(value)) {
    const ms = value.length <= 10 ? Number(value) * 1000 : Number(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

export function openBookingTouchedAt(booking: {
  createdAt: string;
  rooms?: { updatedAt?: string | null }[];
}) {
  return (booking.rooms || []).reduce((max, row) => {
    const at = row.updatedAt || "";
    return at && at > max ? at : max;
  }, booking.createdAt || "");
}

export function openBookingChangedSince(
  booking: { createdAt: string; rooms?: { updatedAt?: string | null }[] },
  since: string,
) {
  const cursor = parseOpenSince(since);
  if (!cursor) return true;
  return openBookingTouchedAt(booking) > cursor;
}

export function serializeOpenBooking(booking: BookingView): OpenBooking {
  const updatedAt = openBookingTouchedAt(booking);
  return {
    id: booking.id,
    pmsCode: booking.pmsCode,
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    origin: booking.origin,
    source: booking.source,
    status: booking.status,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: booking.nights,
    adults: booking.adults,
    children: booking.children,
    notes: booking.notes,
    total: booking.total,
    deposit: booking.deposit,
    rooms: booking.rooms.map((row) => ({
      saleId: row.id,
      roomId: row.roomId,
      roomNumber: row.room?.number || null,
      roomType: row.room?.type || null,
      status: row.status,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      rate: row.rate,
      adults: row.adults,
      children: row.children,
      breakfast: row.breakfast !== false,
    })),
    createdAt: booking.createdAt,
    updatedAt,
  };
}

export async function getOpenBooking(ref: string) {
  const value = ref.trim();
  if (!value) return null;
  const byId = await getBooking(value);
  if (byId) return serializeOpenBooking(byId);
  const sales = await listRoomSales();
  const hit = sales.find((row) => row.pmsCode && row.pmsCode.toLowerCase() === value.toLowerCase());
  if (!hit) return null;
  const booking = await getBooking(bookingKey(hit));
  return booking ? serializeOpenBooking(booking) : null;
}

export async function listOpenBookings(input: {
  from?: string;
  to?: string;
  status?: string;
  origin?: string;
  since?: string;
  limit?: number;
}) {
  const limit = Math.min(200, Math.max(1, Math.round(input.limit || 50)));
  const statusFilter = (input.status || "active")
    .split(",")
    .map((row) => row.trim().toLowerCase())
    .filter(Boolean);
  const all = statusFilter.includes("all");
  const activeOnly = statusFilter.includes("active") || (!all && !statusFilter.length);
  const origin = input.origin?.trim().toLowerCase() || "";
  const since = parseOpenSince(input.since);
  const rows = (await listBookings()).filter((booking) => {
    if (origin && booking.origin !== origin) return false;
    if (since && !openBookingChangedSince(booking, since)) return false;
    if (input.from && booking.checkOut <= input.from) return false;
    if (input.to && booking.checkIn >= input.to) return false;
    if (all) return true;
    if (activeOnly) return booking.status === "reserved" || booking.status === "inhouse";
    return statusFilter.includes(booking.status);
  });
  const listed = since
    ? [...rows].sort((a, b) => openBookingTouchedAt(b).localeCompare(openBookingTouchedAt(a)))
    : rows;
  return listed.slice(0, limit).map(serializeOpenBooking);
}

export type OpenBookingRoomDraft = {
  roomNumber?: string;
  roomId?: string;
  rate?: number;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  breakfast?: boolean;
};

export type OpenBookingCreateDraft = {
  guestName: string;
  guestPhone: string;
  source: string;
  origin: string;
  checkIn: string;
  checkOut: string;
  pmsCode: string;
  notes: string;
  deposit: number;
  paymentMethod: string;
  invoiceRequested: boolean;
  checkinNow: boolean;
  rooms: OpenBookingRoomDraft[];
};

export function parseOpenBookingCreate(body: unknown): OpenBookingCreateDraft {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const guestName = text(record.guestName);
  if (!guestName) throw new Error("Nhập tên khách");
  const checkIn = dateOf(record.checkIn ?? record.arrivalDate);
  const checkOut = dateOf(record.checkOut ?? record.departureDate);
  if (!checkIn || !checkOut) throw new Error("Ngày nhận / trả không hợp lệ");
  if (checkOut <= checkIn) throw new Error("Ngày trả phải sau ngày nhận");
  const origin = text(record.origin).toLowerCase() === "ezcloud" ? "ezcloud" : "ops";
  const sourceRaw = text(record.source ?? record.platform ?? record.channel);
  const source = sourceRaw ? parseSaleSource(sourceRaw) : origin === "ezcloud" ? "ezcloud" : "walk_in";
  const rooms = collectRoomDrafts(record, checkIn, checkOut);
  if (!rooms.length) throw new Error("Chọn phòng");
  return {
    guestName,
    guestPhone: text(record.guestPhone),
    source,
    origin,
    checkIn,
    checkOut,
    pmsCode: text(record.pmsCode),
    notes: text(record.notes),
    deposit: moneyOf(record.deposit),
    paymentMethod: text(record.paymentMethod) || "cash",
    invoiceRequested: Boolean(record.invoiceRequested),
    checkinNow: Boolean(record.checkinNow),
    rooms,
  };
}

export async function openSaleInputFromDraft(draft: OpenBookingCreateDraft): Promise<SaleInput> {
  const rooms = await listRooms();
  const types = await listRoomTypes();
  const typeByName = new Map(types.map((type) => [type.name, type]));
  const roomIds: string[] = [];
  const rates: Record<string, number> = {};
  const dates: Record<string, { checkIn: string; checkOut: string }> = {};
  const adultsByRoom: Record<string, number> = {};
  const childrenByRoom: Record<string, number> = {};
  const breakfasts: Record<string, boolean> = {};
  for (const row of draft.rooms) {
    const room = resolveRoom(rooms, row);
    if (!room) throw new Error(row.roomNumber ? `Không thấy phòng ${normalizeRoomNumber(row.roomNumber)}` : "Không thấy phòng");
    if (roomIds.includes(room.id)) throw new Error(`Phòng ${room.number} bị trùng`);
    roomIds.push(room.id);
    const checkIn = row.checkIn || draft.checkIn;
    const checkOut = row.checkOut || draft.checkOut;
    dates[room.id] = { checkIn, checkOut };
    rates[room.id] = row.rate ?? catalogRate(typeByName.get(room.type), checkIn);
    if (row.adults != null) adultsByRoom[room.id] = row.adults;
    if (row.children != null) childrenByRoom[room.id] = row.children;
    breakfasts[room.id] = row.breakfast !== false;
  }
  return {
    roomIds,
    guestName: draft.guestName,
    guestPhone: draft.guestPhone,
    source: draft.source,
    origin: draft.origin,
    checkIn: draft.checkIn,
    checkOut: draft.checkOut,
    dates,
    rates,
    rate: Object.values(rates)[0] || 0,
    adultsByRoom,
    childrenByRoom,
    breakfasts,
    deposit: draft.deposit,
    paymentMethod: draft.paymentMethod,
    invoiceRequested: draft.invoiceRequested,
    checkinNow: draft.checkinNow,
    pmsCode: draft.pmsCode,
    notes: draft.notes,
  };
}

function collectRoomDrafts(record: Record<string, unknown>, checkIn: string, checkOut: string): OpenBookingRoomDraft[] {
  if (Array.isArray(record.rooms)) {
    return record.rooms
      .filter((row) => row && typeof row === "object")
      .map((row) => roomDraft(row as Record<string, unknown>, checkIn, checkOut));
  }
  const numbers = [
    ...asStringList(record.roomNumbers),
    ...asStringList(record.roomNumber),
    ...asStringList(record.roomId),
    ...asStringList(record.roomIds),
  ];
  if (!numbers.length) return [];
  const sharedRate = record.rate == null ? undefined : moneyOf(record.rate);
  return numbers.map((value) => {
    const looksLikeId = value.startsWith("r-");
    return {
      roomId: looksLikeId ? value : undefined,
      roomNumber: looksLikeId ? undefined : normalizeRoomNumber(value),
      rate: sharedRate,
      checkIn,
      checkOut,
    };
  });
}

function roomDraft(row: Record<string, unknown>, fallbackIn: string, fallbackOut: string): OpenBookingRoomDraft {
  const roomId = text(row.roomId);
  const roomNumber = normalizeRoomNumber(text(row.roomNumber ?? row.room ?? row.number));
  return {
    roomId: roomId || undefined,
    roomNumber: roomNumber || undefined,
    rate: row.rate == null ? undefined : moneyOf(row.rate),
    checkIn: dateOf(row.checkIn ?? row.arrivalDate) || fallbackIn,
    checkOut: dateOf(row.checkOut ?? row.departureDate) || fallbackOut,
    adults: row.adults == null ? undefined : Math.max(1, Math.round(Number(row.adults) || 1)),
    children: row.children == null ? undefined : Math.max(0, Math.round(Number(row.children) || 0)),
    breakfast: row.breakfast == null ? undefined : Boolean(row.breakfast),
  };
}

function resolveRoom(rooms: { id: string; number: string; type: string }[], row: OpenBookingRoomDraft) {
  if (row.roomId) {
    const byId = rooms.find((room) => room.id === row.roomId);
    if (byId) return byId;
  }
  if (row.roomNumber) {
    const number = normalizeRoomNumber(row.roomNumber);
    return rooms.find((room) => room.number === number) || null;
  }
  return null;
}

function text(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function dateOf(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function moneyOf(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return Math.max(0, parseMoney(String(value ?? "")));
}

function asStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((row) => text(row)).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}
