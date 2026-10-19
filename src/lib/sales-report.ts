import { addDaysVN, addMonthsVN, datesUntil, periodWindow, todayVN, type PeriodGrain } from "./datetime";
import { matchesSearchText } from "./search-text";
import {
  bookingDisplayCode,
  bookingPayMethods,
  collectedSplit,
  commissionAmount,
  isOtaDebt,
  isOtaSource,
  refundParts,
  salePaid,
} from "./sales";
import type { PaymentMethod } from "./types";

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
  withheld: number;
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
    withheld: 0,
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
      withheld: fee,
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
    withheld: 0,
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
    withheld: 0,
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
  return { rows, totals: cashTotalsOf(rows) };
}

function cashTotalsOf(rows: { flow: CashFlowLine }[]) {
  return rows.reduce((acc, { flow }) => {
    acc.gross += flow.gross;
    acc.vat += flow.vat;
    acc.net += flow.net;
    acc.cash += flow.cash;
    acc.transfer += flow.transfer;
    acc.company += flow.company;
    acc.receivable += flow.receivable;
    acc.payable += flow.payable;
    acc.withheld += flow.withheld;
    acc.guestDue += flow.guestDue;
    if (flow.refund) acc.refundCount += 1;
    else acc.count += 1;
    if (!flow.refund && flow.recognized) acc.recognizedCount += 1;
    return acc;
  }, emptyCashTotals());
}

export function parseIsoDate(raw?: string | null) {
  const value = String(raw || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function filterCashFlowReport<T extends BookingMoney & { id?: string; guestName?: string; pmsCode?: string | null }>(
  report: { rows: { booking: T; flow: CashFlowLine }[] },
  input: { q?: string | null; arrive?: string | null; depart?: string | null } = {},
) {
  const q = String(input.q || "").trim();
  const arrive = parseIsoDate(input.arrive);
  const depart = parseIsoDate(input.depart);
  const rows = report.rows.filter(({ booking }) => {
    if (arrive && booking.checkIn !== arrive) return false;
    if (depart && booking.checkOut !== depart) return false;
    if (!q) return true;
    const code = bookingDisplayCode({ id: booking.id || "", pmsCode: booking.pmsCode });
    return matchesSearchText([booking.guestName, code, booking.id].filter(Boolean).join(" "), q);
  });
  return { rows, totals: cashTotalsOf(rows) };
}

export const ACTUAL_CASH_KIND_LABEL = {
  deposit: "Đặt cọc",
  checkin: "Thu đủ",
  extra: "Phụ thu",
  refund: "Hoàn cọc",
} as const;

export type ActualCashKind = keyof typeof ACTUAL_CASH_KIND_LABEL;

export type ActualCashTx = {
  id: string;
  bookingId: string;
  bookingCode: string;
  guestName: string;
  roomLabel: string;
  checkIn: string;
  checkOut: string;
  amount: number;
  kind: ActualCashKind;
  typeLabel: string;
  method: PaymentMethod;
};

export type ActualCashGroup = {
  bookingId: string;
  bookingCode: string;
  guestName: string;
  roomLabel: string;
  checkIn: string;
  checkOut: string;
  amount: number;
  cash: number;
  transfer: number;
  company: number;
  rows: ActualCashTx[];
};

export type ActualCashTotals = {
  count: number;
  bookingCount: number;
  amount: number;
  inflow: number;
  refund: number;
  cash: number;
  transfer: number;
  company: number;
};

type ActualCashBooking = BookingMoney & {
  id?: string;
  guestName?: string;
  pmsCode?: string | null;
  roomLabel?: string;
  checkinPaid?: number | null;
  checkinMethod?: string | null;
  extras?: { id?: string; name?: string | null; amount?: number | null }[];
};

const KIND_ORDER: Record<ActualCashKind, number> = { deposit: 0, checkin: 1, extra: 2, refund: 3 };

function methodAmount(method: PaymentMethod, amount: number) {
  return {
    cash: method === "cash" ? amount : 0,
    transfer: method === "personal" ? amount : 0,
    company: method === "company" ? amount : 0,
  };
}

function addMethod(acc: { cash: number; transfer: number; company: number }, method: PaymentMethod, amount: number) {
  const part = methodAmount(method, amount);
  acc.cash += part.cash;
  acc.transfer += part.transfer;
  acc.company += part.company;
}

function emptyActualTotals(): ActualCashTotals {
  return { count: 0, bookingCount: 0, amount: 0, inflow: 0, refund: 0, cash: 0, transfer: 0, company: 0 };
}

function bookingMeta<T extends ActualCashBooking>(booking: T) {
  const id = booking.id || `${booking.guestName || "booking"}-${booking.checkIn}`;
  return {
    bookingId: id,
    bookingCode: bookingDisplayCode({ id, pmsCode: booking.pmsCode }),
    guestName: booking.guestName || "—",
    roomLabel: booking.roomLabel?.trim() || "—",
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
  };
}

function pushTx(
  rows: ActualCashTx[],
  booking: ReturnType<typeof bookingMeta>,
  input: { id: string; amount: number; kind: ActualCashKind; typeLabel?: string; method: PaymentMethod },
) {
  if (!input.amount) return;
  rows.push({
    ...booking,
    id: input.id,
    amount: input.amount,
    kind: input.kind,
    typeLabel: input.typeLabel || ACTUAL_CASH_KIND_LABEL[input.kind],
    method: input.method,
  });
}

function collectedTxs<T extends ActualCashBooking>(booking: T) {
  const meta = bookingMeta(booking);
  const paid = salePaid(booking);
  const split = collectedSplit(paid.deposit, booking.checkinPaid);
  const methods = bookingPayMethods(booking);
  let holdLeft = split.hold;
  let checkinLeft = split.checkin;
  const extras = [...(booking.extras || [])].map((extra, index) => ({
    id: extra.id || `extra-${index + 1}`,
    name: extra.name?.trim() || ACTUAL_CASH_KIND_LABEL.extra,
    amount: Math.max(0, Math.round(extra.amount || 0)),
  }));
  const rows: ActualCashTx[] = [];
  for (const extra of extras) {
    if (!extra.amount) continue;
    const fromCheckin = Math.min(extra.amount, checkinLeft);
    if (fromCheckin) {
      pushTx(rows, meta, {
        id: `${meta.bookingId}-extra-${extra.id}-checkin`,
        amount: fromCheckin,
        kind: "extra",
        typeLabel: extra.name,
        method: methods.checkin,
      });
      checkinLeft -= fromCheckin;
    }
    const fromHold = Math.min(extra.amount - fromCheckin, holdLeft);
    if (fromHold) {
      pushTx(rows, meta, {
        id: `${meta.bookingId}-extra-${extra.id}-deposit`,
        amount: fromHold,
        kind: "extra",
        typeLabel: extra.name,
        method: methods.deposit,
      });
      holdLeft -= fromHold;
    }
  }
  pushTx(rows, meta, { id: `${meta.bookingId}-deposit`, amount: holdLeft, kind: "deposit", method: methods.deposit });
  pushTx(rows, meta, { id: `${meta.bookingId}-checkin`, amount: checkinLeft, kind: "checkin", method: methods.checkin });
  return rows;
}

function refundTxs<T extends ActualCashBooking>(booking: T) {
  const meta = bookingMeta(booking);
  return refundParts(booking).map((part) => ({
    ...meta,
    id: `${meta.bookingId}-refund-${part.method}`,
    amount: -Math.abs(part.amount),
    kind: "refund" as const,
    typeLabel: ACTUAL_CASH_KIND_LABEL.refund,
    method: part.method,
  }));
}

function compareActualTx(a: ActualCashTx, b: ActualCashTx) {
  return (
    a.checkIn.localeCompare(b.checkIn) ||
    a.bookingCode.localeCompare(b.bookingCode) ||
    a.guestName.localeCompare(b.guestName) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    a.typeLabel.localeCompare(b.typeLabel) ||
    a.id.localeCompare(b.id)
  );
}

function summarizeActualCash(rows: ActualCashTx[]) {
  const groupMap = new Map<string, ActualCashGroup>();
  const totals = emptyActualTotals();
  for (const row of rows) {
    totals.count += 1;
    totals.amount += row.amount;
    if (row.amount >= 0) totals.inflow += row.amount;
    else totals.refund += row.amount;
    addMethod(totals, row.method, row.amount);
    const current = groupMap.get(row.bookingId) || {
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      guestName: row.guestName,
      roomLabel: row.roomLabel,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      amount: 0,
      cash: 0,
      transfer: 0,
      company: 0,
      rows: [],
    };
    current.amount += row.amount;
    addMethod(current, row.method, row.amount);
    current.rows.push(row);
    groupMap.set(row.bookingId, current);
  }
  const groups = [...groupMap.values()].sort(
    (a, b) => a.checkIn.localeCompare(b.checkIn) || a.bookingCode.localeCompare(b.bookingCode) || a.guestName.localeCompare(b.guestName),
  );
  totals.bookingCount = groups.length;
  return { rows, groups, totals };
}

export function actualCashFlowReport<T extends ActualCashBooking>(bookings: T[], from: string, to: string) {
  const rows = bookings
    .flatMap((booking) => {
      const stay = countsAsBookingRevenue(booking.status) && booking.checkIn >= from && booking.checkIn < to;
      const refundDate = String(booking.refundedAt || "").slice(0, 10);
      const refunded = /^\d{4}-\d{2}-\d{2}$/.test(refundDate) && refundDate >= from && refundDate < to;
      return [...(stay ? collectedTxs(booking) : []), ...(refunded ? refundTxs(booking) : [])];
    })
    .sort(compareActualTx);
  return summarizeActualCash(rows);
}

function actualSearchText(row: ActualCashTx) {
  return [row.bookingCode, row.bookingId, row.guestName, row.roomLabel].filter(Boolean).join(" ");
}

export function filterActualCashFlow(
  report: { rows: ActualCashTx[] },
  input: { q?: string | null; arrive?: string | null; depart?: string | null } = {},
) {
  const q = String(input.q || "").trim();
  const arrive = parseIsoDate(input.arrive);
  const depart = parseIsoDate(input.depart);
  const rows = report.rows.filter((row) => {
    if (arrive && row.checkIn !== arrive) return false;
    if (depart && row.checkOut !== depart) return false;
    return !q || matchesSearchText(actualSearchText(row), q);
  });
  return summarizeActualCash(rows);
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
