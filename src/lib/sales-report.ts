import { periodWindow, todayVN, type PeriodGrain } from "./datetime";
import { salePaid } from "./sales";

export const PERIOD_GRAINS = ["month", "quarter", "year"] as const;
export type ReportGrain = (typeof PERIOD_GRAINS)[number];

export function isReportGrain(value: string): value is ReportGrain {
  return (PERIOD_GRAINS as readonly string[]).includes(value);
}

export function parseReportDate(raw: string | undefined, today: string) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (raw && /^\d{4}$/.test(raw)) return `${raw}-01-01`;
  return today;
}

export function parsePeriodQuery(rawGrain?: string, rawDate?: string, today = todayVN()) {
  const grain: PeriodGrain = rawGrain && isReportGrain(rawGrain) ? rawGrain : "month";
  const date = parseReportDate(rawDate, today);
  const window = periodWindow(grain, date);
  return { grain, date, window };
}

type BookingMoney = {
  checkIn: string;
  checkOut: string;
  status: string;
  total: number;
  due: number;
  deposit: number;
  cashPaid?: number | null;
  transferPaid?: number | null;
};

function moneyOf<T extends BookingMoney>(rows: T[]) {
  return rows.reduce(
    (acc, row) => {
      const paid = salePaid(row);
      acc.total += row.total;
      acc.deposit += paid.deposit;
      acc.due += row.due;
      acc.cash += paid.cashPaid;
      acc.transfer += paid.transferPaid;
      return acc;
    },
    { total: 0, deposit: 0, due: 0, cash: 0, transfer: 0 },
  );
}

export function roomRevenueReport<T extends BookingMoney>(bookings: T[], from: string, to: string) {
  const live = bookings.filter((row) => row.status !== "cancelled" && row.status !== "no_show");
  const booked = live.filter((row) => row.checkIn >= from && row.checkIn < to);
  const recognized = live.filter((row) => row.status === "departed" && row.checkOut >= from && row.checkOut < to);
  return {
    booked,
    recognized,
    booking: moneyOf(booked),
    recognizedMoney: moneyOf(recognized),
  };
}

type GuestRow = BookingMoney & {
  adults: number;
  children: number;
  nights: number;
  roomCount: number;
  source: string;
};

export function ownerGuestReport<T extends GuestRow>(bookings: T[], from: string, to: string) {
  const live = bookings.filter((row) => row.status !== "cancelled" && row.status !== "no_show");
  const guests = live.filter((row) => row.checkIn >= from && row.checkIn < to);
  const staying = live.filter((row) => row.checkIn < to && row.checkOut > from);
  const adults = guests.reduce((sum, row) => sum + row.adults, 0);
  const children = guests.reduce((sum, row) => sum + row.children, 0);
  const roomNights = guests.reduce((sum, row) => sum + row.nights * (row.roomCount || 1), 0);
  const bySource = new Map<string, number>();
  for (const row of guests) {
    bySource.set(row.source, (bySource.get(row.source) || 0) + 1);
  }
  return {
    guests,
    staying,
    adults,
    children,
    people: adults + children,
    roomNights,
    bookings: guests.length,
    bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
