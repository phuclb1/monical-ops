import type { ShiftType } from "./types";

export const TZ = "Asia/Ho_Chi_Minh";

export function nowISO() {
  return new Date().toISOString();
}

export function todayVN(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

export function hourVN(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}

export function currentShiftType(date = new Date()): ShiftType {
  const hour = hourVN(date);
  if (hour >= 6 && hour < 14) return "morning";
  if (hour >= 14 && hour < 22) return "afternoon";
  return "night";
}

export function shiftWindow(type: ShiftType, date = todayVN()) {
  if (type === "morning") return { start: `${date}T06:00:00+07:00`, end: `${date}T14:00:00+07:00` };
  if (type === "afternoon") return { start: `${date}T14:00:00+07:00`, end: `${date}T22:00:00+07:00` };
  return { start: `${date}T22:00:00+07:00`, end: `${nextDate(date)}T06:00:00+07:00` };
}

export function nextDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() + 1);
  return todayVN(d);
}

export function prevDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() - 1);
  return todayVN(d);
}

export function formatTime(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(isoDate?: string | null) {
  if (!isoDate) return "—";
  const d = isoDate.length > 10 ? new Date(isoDate) : new Date(`${isoDate}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export function remainingLabel(endIso: string) {
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return "Đã hết ca";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Còn ${h}g ${m}p`;
}

export function minutesLeft(dueIso: string) {
  return Math.round((new Date(dueIso).getTime() - Date.now()) / 60_000);
}

export function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function nid() {
  return crypto.randomUUID();
}
