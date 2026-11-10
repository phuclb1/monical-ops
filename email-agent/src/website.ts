import { sameSecret } from "./telegram";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type WebsiteBookingInput = {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  adults: number;
  children: number;
  rate: number;
  notes: string;
};

export function websiteCors(request: Request) {
  const origin = request.headers.get("Origin") || "";
  let allow = "https://monicalhoteldalat.com";
  try {
    const host = new URL(origin).hostname;
    if (host === "monicalhoteldalat.com" || host.endsWith(".monicalhoteldalat.com")) allow = origin;
  } catch {
    allow = "https://monicalhoteldalat.com";
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Website-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function websiteAuthorized(request: Request, token: string) {
  if (!token) return false;
  const header = request.headers.get("Authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("X-Website-Token") || "";
  const provided = bearer || alt;
  return Boolean(provided) && sameSecret(provided, token);
}

export function parseWebsiteBooking(body: unknown): WebsiteBookingInput {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const guestName = text(record.guestName);
  const checkIn = text(record.checkIn || record.arrivalDate);
  const checkOut = text(record.checkOut || record.departureDate);
  if (!guestName) throw new Error("Nhập tên khách");
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) throw new Error("Ngày nhận / trả không hợp lệ");
  const adults = clamp(record.adults, 1, 10, 1);
  const children = clamp(record.children, 0, 10, 0);
  const rate = Math.max(0, Math.round(Number(record.rate) || 0));
  return {
    guestName,
    guestPhone: text(record.guestPhone).slice(0, 40),
    guestEmail: text(record.guestEmail).slice(0, 120),
    checkIn,
    checkOut,
    roomType: text(record.roomType).slice(0, 80),
    adults,
    children,
    rate,
    notes: text(record.notes).slice(0, 1000),
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
