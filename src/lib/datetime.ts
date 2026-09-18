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

export const WEEKDAYS = [
  { iso: 1, short: "T2", long: "Thứ 2" },
  { iso: 2, short: "T3", long: "Thứ 3" },
  { iso: 3, short: "T4", long: "Thứ 4" },
  { iso: 4, short: "T5", long: "Thứ 5" },
  { iso: 5, short: "T6", long: "Thứ 6" },
  { iso: 6, short: "T7", long: "Thứ 7" },
  { iso: 7, short: "CN", long: "Chủ nhật" },
] as const;

export function weekdayISO(isoDate: string) {
  const js = new Date(`${isoDate}T12:00:00+07:00`).getDay();
  return js === 0 ? 7 : js;
}

export function addDaysVN(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return todayVN(d);
}

const SOLAR_HOLIDAYS = new Set(["01-01", "04-30", "05-01", "09-02", "09-03"]);
const TET_RANGES: [string, string][] = [
  ["2025-01-25", "2025-02-02"],
  ["2026-02-14", "2026-02-23"],
  ["2027-02-04", "2027-02-14"],
  ["2028-01-24", "2028-02-02"],
];
const HUNG_KINGS = new Set(["2025-04-07", "2026-03-28", "2027-04-16", "2028-04-04"]);

export function isPublicHolidayVN(isoDate: string) {
  if (SOLAR_HOLIDAYS.has(isoDate.slice(5))) return true;
  if (HUNG_KINGS.has(isoDate)) return true;
  return TET_RANGES.some(([start, end]) => isoDate >= start && isoDate <= end);
}

export function isHolidayNight(isoDate: string) {
  return weekdayISO(isoDate) >= 5 || isPublicHolidayVN(isoDate);
}

export function startOfWeekVN(isoDate: string) {
  return addDaysVN(isoDate, 1 - weekdayISO(isoDate));
}

export function startOfMonthVN(isoDate: string) {
  return `${isoDate.slice(0, 7)}-01`;
}

export function startOfYearVN(isoDate: string) {
  return `${isoDate.slice(0, 4)}-01-01`;
}

export function startOfQuarterVN(isoDate: string) {
  const month = Number(isoDate.slice(5, 7));
  const start = Math.floor((Math.max(1, month) - 1) / 3) * 3 + 1;
  return `${isoDate.slice(0, 4)}-${String(start).padStart(2, "0")}-01`;
}

export function quarterOfVN(isoDate: string) {
  return Math.floor((Number(startOfQuarterVN(isoDate).slice(5, 7)) - 1) / 3) + 1;
}

export type PeriodGrain = "month" | "quarter" | "year";

export function periodWindow(grain: PeriodGrain, isoDate: string) {
  if (grain === "year") {
    const from = startOfYearVN(isoDate);
    return { from, to: addMonthsVN(from, 12), prev: addMonthsVN(from, -12), next: addMonthsVN(from, 12) };
  }
  if (grain === "quarter") {
    const from = startOfQuarterVN(isoDate);
    return { from, to: addMonthsVN(from, 3), prev: addMonthsVN(from, -3), next: addMonthsVN(from, 3) };
  }
  const from = startOfMonthVN(isoDate);
  return { from, to: addMonthsVN(from, 1), prev: addMonthsVN(from, -1), next: addMonthsVN(from, 1) };
}

export function formatPeriodLabel(grain: PeriodGrain, isoDate: string) {
  const year = isoDate.slice(0, 4);
  if (grain === "year") return `Năm ${year}`;
  if (grain === "quarter") return `Quý ${quarterOfVN(isoDate)}/${year}`;
  return formatMonthLong(isoDate);
}

export function addMonthsVN(isoDate: string, delta: number) {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index % 12;
  const last = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day || 1, last);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

export function datesUntil(from: string, toExclusive: string) {
  const days: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(toExclusive) || toExclusive <= from) return days;
  for (let date = from; date < toExclusive; date = addDaysVN(date, 1)) {
    days.push(date);
    if (days.length > 62) break;
  }
  return days;
}

export function weekOfVN(isoDate = todayVN()) {
  const start = startOfWeekVN(isoDate);
  return WEEKDAYS.map((day, i) => ({
    ...day,
    date: addDaysVN(start, i),
  }));
}

export function formatDayMonth(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function formatDateLong(isoDate: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00+07:00`));
}

export function formatDateNumeric(isoDate?: string | null) {
  if (!isoDate) return "";
  const d = isoDate.length > 10 ? new Date(isoDate) : new Date(`${isoDate}T12:00:00+07:00`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatStayStamp(isoDate: string, time: string) {
  return `${formatDateNumeric(isoDate)}, ${time}`;
}

export function formatWeekRange(isoDate = todayVN()) {
  const days = weekOfVN(isoDate);
  return `${formatDayMonth(days[0].date)} – ${formatDayMonth(days[6].date)}/${days[6].date.slice(0, 4)}`;
}

export function formatMonthLong(isoDate: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(`${startOfMonthVN(isoDate)}T12:00:00+07:00`));
}

export function nextShiftSlot(type: ShiftType, date: string) {
  if (type === "morning") return { type: "afternoon" as const, date };
  if (type === "afternoon") return { type: "night" as const, date };
  return { type: "morning" as const, date: nextDate(date) };
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
