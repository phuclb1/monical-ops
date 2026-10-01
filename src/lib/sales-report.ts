import { addDaysVN, addMonthsVN, datesUntil, periodWindow, todayVN, type PeriodGrain } from "./datetime";
import { commissionAmount, isOtaDebt, isOtaSource, salePaid } from "./sales";

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
  companyPaid?: number | null;
  refundCash?: number | null;
  refundTransfer?: number | null;
  refundCompany?: number | null;
  refundedAt?: string | null;
  source?: string | null;
  otaPaymentMode?: string | null;
  otaCommissionPercent?: number | null;
  otaCommissionKind?: string | null;
  otaCommissionValue?: number | null;
};

function feeOf(row: BookingMoney) {
  if (!isOtaSource(row.source)) return 0;
  const kind = row.otaCommissionKind === "amount" ? "amount" : "percent";
  const value = row.otaCommissionValue || (kind === "percent" ? row.otaCommissionPercent || 0 : 0);
  return commissionAmount(row.total, kind, value);
}

function recognizedBreakdown<T extends BookingMoney>(rows: T[]) {
  const pay = { cash: 0, transfer: 0, company: 0 };
  let otaGross = 0;
  let commission = 0;
  let partnerGross = 0;
  let collectedGross = 0;
  let collectedCommission = 0;
  for (const row of rows) {
    if (isOtaSource(row.source)) {
      const fee = feeOf(row);
      otaGross += row.total;
      commission += fee;
      if (isOtaDebt(row.source, row.otaPaymentMode)) {
        partnerGross += row.total;
      } else {
        collectedGross += row.total;
        collectedCommission += fee;
      }
      continue;
    }
    const paid = salePaid(row);
    pay.cash += paid.cashPaid;
    pay.transfer += paid.transferPaid;
    pay.company += paid.companyPaid;
  }
  return {
    pay,
    ota: {
      gross: otaGross,
      commission,
      net: otaGross - commission,
      partnerNet: partnerGross - (commission - collectedCommission),
      collectedGross,
      collectedCommission,
    },
  };
}

function moneyOf<T extends BookingMoney>(rows: T[]) {
  return rows.reduce(
    (acc, row) => {
      const paid = salePaid(row);
      acc.total += row.total;
      acc.deposit += paid.deposit;
      acc.due += row.due;
      acc.cash += paid.cashPaid;
      acc.transfer += paid.transferPaid;
      acc.company += paid.companyPaid;
      if (isOtaSource(row.source)) acc.ota += row.total;
      return acc;
    },
    { total: 0, deposit: 0, due: 0, cash: 0, transfer: 0, company: 0, ota: 0 },
  );
}

export function isInvoiceRevenueRow(row: { source?: string | null; invoiceRequested?: boolean | number | null }) {
  return isOtaSource(row.source) || Boolean(row.invoiceRequested);
}

export function invoiceRevenueReport<T extends BookingMoney & { invoiceRequested?: boolean | number | null }>(rows: T[]) {
  const included = rows.filter((row) => isInvoiceRevenueRow(row));
  const direct = included.filter((row) => !isOtaSource(row.source));
  const ota = included.filter((row) => isOtaSource(row.source));
  return {
    rows: included,
    direct,
    ota,
    money: moneyOf(included),
    directMoney: moneyOf(direct),
    otaMoney: moneyOf(ota),
  };
}

function countsAsBookingRevenue(status: string) {
  return status !== "cancelled" && status !== "no_show";
}

export const CASH_FLOW_KIND_LABEL = {
  direct: "Trực tiếp",
  ota_debt: "OTA công nợ",
  ota_hotel: "OTA thu tại KS",
} as const;

export type CashFlowKind = keyof typeof CASH_FLOW_KIND_LABEL;

export type CashFlowLine = {
  kind: CashFlowKind;
  recognized: boolean;
  gross: number;
  vat: number;
  net: number;
  cash: number;
  transfer: number;
  company: number;
  receivable: number;
  payable: number;
  guestDue: number;
  refund?: boolean;
};

export type CashFlowTotals = Omit<CashFlowLine, "kind" | "recognized" | "refund"> & {
  count: number;
  recognizedCount: number;
  refundCount: number;
};

export function inclusiveVat(total: number) {
  const gross = Math.max(0, Math.round(total || 0));
  const vat = Math.round((gross * 8) / 108);
  return { gross, vat, net: gross - vat };
}

function emptyCashTotals(): CashFlowTotals {
  return {
    gross: 0,
    vat: 0,
    net: 0,
    cash: 0,
    transfer: 0,
    company: 0,
    receivable: 0,
    payable: 0,
    guestDue: 0,
    count: 0,
    recognizedCount: 0,
    refundCount: 0,
  };
}

export function cashFlowOf<T extends BookingMoney>(row: T, today = todayVN()): CashFlowLine {
  const { gross, vat, net } = inclusiveVat(row.total);
  const paid = salePaid(row);
  const fee = feeOf(row);
  const ota = isOtaSource(row.source);
  const debt = isOtaDebt(row.source, row.otaPaymentMode);
  const kind: CashFlowKind = !ota ? "direct" : debt ? "ota_debt" : "ota_hotel";
  const recognized = row.checkIn <= today;
  if (kind === "ota_debt") {
    return {
      kind,
      recognized,
      gross,
      vat,
      net,
      cash: 0,
      transfer: 0,
      company: 0,
      receivable: gross - fee,
      payable: 0,
      guestDue: 0,
    };
  }
  const guestDue = Math.max(0, Math.round(row.due || 0));
  return {
    kind,
    recognized,
    gross,
    vat,
    net,
    cash: paid.cashPaid,
    transfer: paid.transferPaid,
    company: paid.companyPaid,
    receivable: 0,
    payable: kind === "ota_hotel" ? fee : 0,
    guestDue,
  };
}

function moneyOut(value?: number | null) {
  const amount = Math.max(0, Math.round(value || 0));
  return amount ? -amount : 0;
}

function refundFlowOf<T extends BookingMoney>(row: T): CashFlowLine | null {
  const cash = moneyOut(row.refundCash);
  const transfer = moneyOut(row.refundTransfer);
  const company = moneyOut(row.refundCompany);
  if (!cash && !transfer && !company) return null;
  const date = String(row.refundedAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    kind: "direct",
    recognized: true,
    refund: true,
    gross: 0,
    vat: 0,
    net: 0,
    cash,
    transfer,
    company,
    receivable: 0,
    payable: 0,
    guestDue: 0,
  };
}

export function cashFlowReport<T extends BookingMoney>(bookings: T[], from: string, to: string, today = todayVN()) {
  const stays = bookings
    .filter((row) => countsAsBookingRevenue(row.status) && row.checkIn >= from && row.checkIn < to)
    .map((booking) => ({ booking, flow: cashFlowOf(booking, today) }));
  const refunds = bookings.flatMap((booking) => {
    const flow = refundFlowOf(booking);
    const date = String(booking.refundedAt || "").slice(0, 10);
    if (!flow || date < from || date >= to) return [];
    return [{ booking, flow }];
  });
  const rows = [...stays, ...refunds];
  const totals = rows.reduce((acc, { flow }) => {
    acc.gross += flow.gross;
    acc.vat += flow.vat;
    acc.net += flow.net;
    acc.cash += flow.cash;
    acc.transfer += flow.transfer;
    acc.company += flow.company;
    acc.receivable += flow.receivable;
    acc.payable += flow.payable;
    acc.guestDue += flow.guestDue;
    if (flow.refund) acc.refundCount += 1;
    else acc.count += 1;
    if (!flow.refund && flow.recognized) acc.recognizedCount += 1;
    return acc;
  }, emptyCashTotals());
  return { rows, totals };
}

export function roomRevenueReport<T extends BookingMoney>(bookings: T[], from: string, to: string, today = todayVN()) {
  const booked = bookings.filter((row) => countsAsBookingRevenue(row.status) && row.checkIn >= from && row.checkIn < to);
  const recognized = booked.filter((row) => row.checkIn <= today);
  return {
    booked,
    recognized,
    booking: moneyOf(booked),
    recognizedMoney: moneyOf(recognized),
    recognizedSplit: recognizedBreakdown(recognized),
  };
}

export function revenueTrend<T extends BookingMoney>(
  bookings: T[],
  from: string,
  to: string,
  grain: ReportGrain,
  today = todayVN(),
) {
  const buckets =
    grain === "month"
      ? datesUntil(from, to).map((date) => ({
          key: date,
          from: date,
          to: addDaysVN(date, 1),
          label: String(Number(date.slice(8, 10))),
        }))
      : Array.from({ length: grain === "quarter" ? 3 : 12 }, (_, index) => {
          const date = addMonthsVN(from, index);
          return {
            key: date.slice(0, 7),
            from: date,
            to: addMonthsVN(date, 1),
            label: `T${Number(date.slice(5, 7))}`,
          };
        });
  const live = bookings.filter((row) => countsAsBookingRevenue(row.status));

  return buckets.map((bucket) => {
    const rows = live.filter((row) => row.checkIn >= bucket.from && row.checkIn < bucket.to);
    const recognized = rows.filter((row) => row.checkIn <= today);
    return {
      key: bucket.key,
      label: bucket.label,
      booked: rows.reduce((sum, row) => sum + row.total, 0),
      recognized: recognized.reduce((sum, row) => sum + row.total, 0),
    };
  });
}

export function roomPerformanceSummary(input: { soldNights: number; vacantNights: number; revenue: number }) {
  const availableNights = Math.max(0, input.soldNights + input.vacantNights);
  return {
    availableNights,
    occupancy: availableNights > 0 ? input.soldNights / availableNights : 0,
    adr: input.soldNights > 0 ? Math.round(input.revenue / input.soldNights) : 0,
    revPar: availableNights > 0 ? Math.round(input.revenue / availableNights) : 0,
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
