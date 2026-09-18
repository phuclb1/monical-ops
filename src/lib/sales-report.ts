import { salePaid } from "./sales";

export const PERIOD_GRAINS = ["month", "quarter", "year"] as const;
export type ReportGrain = (typeof PERIOD_GRAINS)[number];

export function isReportGrain(value: string): value is ReportGrain {
  return (PERIOD_GRAINS as readonly string[]).includes(value);
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
