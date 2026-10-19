import { addDaysVN } from "../datetime";
import type { PaymentMethod } from "../types";
import { PAYMENT_METHODS } from "../types";

export const DEPOSIT_REFUND_LEAD_DAYS = 7;

export type CommissionKind = "percent" | "amount";

export function parseCommissionKind(value: FormDataEntryValue | string | null | undefined): CommissionKind {
  return String(value || "") === "amount" ? "amount" : "percent";
}

export function commissionAmount(total: number, kind: string | null | undefined, value: number | null | undefined) {
  const safeTotal = Math.max(0, Math.round(total || 0));
  if (parseCommissionKind(kind) === "amount") return Math.min(safeTotal, Math.max(0, Math.round(value || 0)));
  const percent = Math.min(100, Math.max(0, Math.round(value || 0)));
  return Math.round(safeTotal * percent / 100);
}

export function normalizeCommission(ota: boolean, kind: string | null | undefined, value: number | null | undefined) {
  if (!ota) return { otaCommissionKind: "percent" as const, otaCommissionValue: 0, otaCommissionPercent: 0 };
  const otaCommissionKind = parseCommissionKind(kind);
  const otaCommissionValue = otaCommissionKind === "percent"
    ? Math.min(100, Math.max(0, Math.round(value || 0)))
    : Math.max(0, Math.round(value || 0));
  return {
    otaCommissionKind,
    otaCommissionValue,
    otaCommissionPercent: otaCommissionKind === "percent" ? otaCommissionValue : 0,
  };
}

export function parseCommissionValue(kind: FormDataEntryValue | string | null | undefined, raw: FormDataEntryValue | string | null | undefined) {
  if (parseCommissionKind(kind) === "percent") return parseCommissionPercent(raw);
  return parseMoney(raw);
}

export function parseCommissionPercent(value: FormDataEntryValue | string | null | undefined) {
  const raw = String(value ?? "").replace("%", "").replace(",", ".").trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n));
}

export function parseMoney(value: FormDataEntryValue | string | null | undefined) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

export function formatVnd(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(value)))}₫`;
}

export function formatVndLetter(value: number) {
  return `VND ${new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)))}`;
}

export function parkingLabel(cars?: number | null, bikes?: number | null) {
  const parts: string[] = [];
  if (cars) parts.push(`${cars} ô tô`);
  if (bikes) parts.push(`${bikes} xe máy`);
  return parts.join(" · ") || "—";
}

export function bookingDisplayCode(booking: { pmsCode?: string | null; id: string }) {
  return booking.pmsCode?.trim() || booking.id;
}

export function bookingPdfFilename(booking: { pmsCode?: string | null; id: string }) {
  const raw = bookingDisplayCode(booking);
  const safe = raw.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "booking";
  return `${safe}.pdf`;
}

export function bookingDue(total: number, deposit: number, refunded = 0) {
  const collected = Math.max(0, Math.round(deposit || 0) - Math.max(0, Math.round(refunded || 0)));
  return Math.max(0, Math.round(total || 0) - collected);
}

export function bookingSettledTotal(quoteTotal: number, deposit: number, refunded: number) {
  const quoted = Math.max(0, Math.round(quoteTotal || 0));
  const refund = Math.max(0, Math.round(refunded || 0));
  if (!refund) return quoted;
  const paid = Math.max(0, Math.round(deposit || 0));
  return Math.max(0, Math.max(quoted, paid) - refund);
}

export function bookingRefundKeep(quoteTotal: number, settledTotal: number) {
  return Math.max(0, Math.round(settledTotal || 0) - Math.max(0, Math.round(quoteTotal || 0)));
}

export function collectedSplit(deposit: number, checkinPaid?: number | null) {
  const total = Math.max(0, Math.round(deposit || 0));
  const checkin = Math.min(total, Math.max(0, Math.round(checkinPaid || 0)));
  return { hold: total - checkin, checkin, total };
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function parsePaymentMethod(value: FormDataEntryValue | string | null | undefined): PaymentMethod {
  const raw = String(value || "");
  if (raw === "cash") return "cash";
  if (raw === "company") return "company";
  return "personal";
}

type PaidSplit = {
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
  deposit?: number | null;
};

export function salePaid(row: PaidSplit) {
  const cashPaid = Math.max(0, Math.round(row.cashPaid || 0));
  const transferPaid = Math.max(0, Math.round(row.transferPaid || 0));
  const companyPaid = Math.max(0, Math.round(row.companyPaid || 0));
  const deposit = Math.max(0, Math.round(row.deposit || 0));
  const split = cashPaid + transferPaid + companyPaid;
  if (split === 0 && deposit > 0) {
    return { cashPaid: 0, transferPaid: deposit, companyPaid: 0, deposit };
  }
  return { cashPaid, transferPaid, companyPaid, deposit: split || deposit };
}

export function paidFromMethod(amount: number, method: PaymentMethod) {
  const deposit = Math.max(0, Math.round(amount || 0));
  if (method === "cash") return { cashPaid: deposit, transferPaid: 0, companyPaid: 0, deposit };
  if (method === "company") return { cashPaid: 0, transferPaid: 0, companyPaid: deposit, deposit };
  return { cashPaid: 0, transferPaid: deposit, companyPaid: 0, deposit };
}

export function applyPaidAmount(current: PaidSplit, nextDeposit: number, method: PaymentMethod) {
  const paid = salePaid(current);
  const next = Math.max(0, Math.round(nextDeposit || 0));
  if (next === paid.deposit) return paid;
  if (next > paid.deposit) {
    const extra = next - paid.deposit;
    if (method === "cash") return { ...paid, cashPaid: paid.cashPaid + extra, deposit: next };
    if (method === "company") return { ...paid, companyPaid: paid.companyPaid + extra, deposit: next };
    return { ...paid, transferPaid: paid.transferPaid + extra, deposit: next };
  }
  let need = paid.deposit - next;
  const buckets = {
    cash: paid.cashPaid,
    personal: paid.transferPaid,
    company: paid.companyPaid,
  };
  const order: PaymentMethod[] =
    method === "cash" ? ["cash", "personal", "company"] : method === "company" ? ["company", "personal", "cash"] : ["personal", "company", "cash"];
  for (const key of order) {
    if (need <= 0) break;
    const take = Math.min(buckets[key], need);
    buckets[key] -= take;
    need -= take;
  }
  return {
    cashPaid: Math.max(0, buckets.cash),
    transferPaid: Math.max(0, buckets.personal),
    companyPaid: Math.max(0, buckets.company),
    deposit: next,
  };
}

export function paidFromParts(hold: number, holdMethod: PaymentMethod, checkin: number, checkinMethod: PaymentMethod) {
  const depositPart = paidFromMethod(hold, holdMethod);
  const checkinPart = paidFromMethod(checkin, checkinMethod);
  return {
    cashPaid: depositPart.cashPaid + checkinPart.cashPaid,
    transferPaid: depositPart.transferPaid + checkinPart.transferPaid,
    companyPaid: depositPart.companyPaid + checkinPart.companyPaid,
    deposit: depositPart.deposit + checkinPart.deposit,
  };
}

export function depositMethodOf(row: PaidSplit, checkinPaid?: number | null, checkinMethod?: string | null): PaymentMethod {
  const total = salePaid(row);
  const method = parsePaymentMethod(checkinMethod || primaryPaymentMethod(total));
  const checkin = paidFromMethod(Math.min(total.deposit, Math.max(0, Math.round(checkinPaid || 0))), method);
  const rest = {
    cashPaid: Math.max(0, total.cashPaid - checkin.cashPaid),
    transferPaid: Math.max(0, total.transferPaid - checkin.transferPaid),
    companyPaid: Math.max(0, total.companyPaid - checkin.companyPaid),
    deposit: Math.max(0, total.deposit - checkin.deposit),
  };
  if (!rest.deposit) return method;
  return primaryPaymentMethod(rest);
}

export function primaryPaymentMethod(row: PaidSplit): PaymentMethod {
  const paid = salePaid(row);
  if (paid.companyPaid >= paid.transferPaid && paid.companyPaid >= paid.cashPaid && paid.companyPaid > 0) return "company";
  if (paid.cashPaid >= paid.transferPaid && paid.cashPaid > 0) return "cash";
  return "personal";
}

export function bookingPayMethods(row: PaidSplit & { checkinPaid?: number | null; checkinMethod?: string | null }) {
  const fallback = primaryPaymentMethod(row);
  const checkin = isPaymentMethod(String(row.checkinMethod || "")) ? row.checkinMethod as PaymentMethod : fallback;
  return {
    deposit: depositMethodOf(row, row.checkinPaid, checkin),
    checkin,
  };
}

export function depositRefundAllowed(checkIn: string, cancelDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(cancelDate)) return false;
  return addDaysVN(cancelDate, DEPOSIT_REFUND_LEAD_DAYS) <= checkIn;
}

export function depositRefundSplit(row: PaidSplit & { checkinPaid?: number | null; checkinMethod?: string | null }) {
  const paid = salePaid(row);
  const hold = collectedSplit(paid.deposit, row.checkinPaid).hold;
  const method = depositMethodOf(row, row.checkinPaid, row.checkinMethod);
  const refund = paidFromMethod(hold, method);
  return {
    refundCash: refund.cashPaid,
    refundTransfer: refund.transferPaid,
    refundCompany: refund.companyPaid,
  };
}

export function refundParts(row: { refundCash?: number | null; refundTransfer?: number | null; refundCompany?: number | null }) {
  const parts: { method: PaymentMethod; amount: number }[] = [];
  if (row.refundCompany) parts.push({ method: "company", amount: Math.round(row.refundCompany) });
  if (row.refundTransfer) parts.push({ method: "personal", amount: Math.round(row.refundTransfer) });
  if (row.refundCash) parts.push({ method: "cash", amount: Math.round(row.refundCash) });
  return parts;
}

export const STAY_REFUND_REASONS = ["early_out", "cancel_night", "other"] as const;
export type StayRefundReason = (typeof STAY_REFUND_REASONS)[number];

export const STAY_REFUND_REASON_LABEL: Record<StayRefundReason, string> = {
  early_out: "Trả sớm",
  cancel_night: "Hủy đêm (giữ 50%)",
  other: "Hoàn khác",
};

export function parseStayRefundReason(value: FormDataEntryValue | string | null | undefined): StayRefundReason {
  const raw = String(value || "");
  if (raw === "early_out" || raw === "cancel_night" || raw === "other") return raw;
  return "other";
}

export function refundReasonLabel(value?: string | null) {
  if (value === "early_out") return "Hoàn trả sớm";
  if (value === "cancel_night") return "Hoàn hủy đêm";
  if (value === "other") return "Hoàn tiền";
  return "Hoàn cọc";
}

export function stayNightlyRate(roomTotal: number, nights: number) {
  const stayNights = Math.max(1, Math.round(nights || 0));
  return Math.round(Math.max(0, Math.round(roomTotal || 0)) / stayNights);
}

export function stayRefundQuote(input: {
  reason: StayRefundReason;
  nights?: number;
  roomTotal: number;
  stayNights: number;
  amount?: number;
}) {
  const nightly = stayNightlyRate(input.roomTotal, input.stayNights);
  const nights = Math.max(1, Math.round(input.nights || 1));
  if (input.reason === "early_out") return nights * nightly;
  if (input.reason === "cancel_night") return Math.round(nights * nightly * 0.5);
  return Math.max(0, Math.round(input.amount || 0));
}

export function refundTotal(row: { refundCash?: number | null; refundTransfer?: number | null; refundCompany?: number | null }) {
  return Math.max(0, Math.round(row.refundCash || 0) + Math.round(row.refundTransfer || 0) + Math.round(row.refundCompany || 0));
}

export function stayRefundable(collected: number, alreadyRefunded: number) {
  return Math.max(0, Math.round(collected || 0) - Math.max(0, Math.round(alreadyRefunded || 0)));
}

export function stayRefundOverpay(collected: number, alreadyRefunded: number, currentTotal: number) {
  return Math.max(0, stayRefundable(collected, alreadyRefunded) - Math.max(0, Math.round(currentTotal || 0)));
}

export function refundSplitFromMethod(amount: number, method: PaymentMethod) {
  const paid = paidFromMethod(amount, method);
  return {
    refundCash: paid.cashPaid,
    refundTransfer: paid.transferPaid,
    refundCompany: paid.companyPaid,
  };
}

export function addRefundSplit(
  current: { refundCash?: number | null; refundTransfer?: number | null; refundCompany?: number | null },
  extra: { refundCash: number; refundTransfer: number; refundCompany: number },
) {
  return {
    refundCash: Math.max(0, Math.round(current.refundCash || 0)) + extra.refundCash,
    refundTransfer: Math.max(0, Math.round(current.refundTransfer || 0)) + extra.refundTransfer,
    refundCompany: Math.max(0, Math.round(current.refundCompany || 0)) + extra.refundCompany,
  };
}

export function paidNote(row: PaidSplit) {
  const paid = salePaid(row);
  const parts: string[] = [];
  if (paid.companyPaid) parts.push(`CK công ty ${formatVnd(paid.companyPaid)}`);
  if (paid.transferPaid) parts.push(`CK cá nhân ${formatVnd(paid.transferPaid)}`);
  if (paid.cashPaid) parts.push(`tiền mặt ${formatVnd(paid.cashPaid)}`);
  return parts.join(" · ");
}

export function paidMethodLabel(row: PaidSplit) {
  const paid = salePaid(row);
  const parts: string[] = [];
  if (paid.companyPaid) parts.push("CK công ty");
  if (paid.transferPaid) parts.push("CK cá nhân");
  if (paid.cashPaid) parts.push("tiền mặt");
  return parts.join(" · ");
}

export function discountLabel(kind: string | null | undefined, value: number | null | undefined) {
  if (kind === "percent" && value) return `${value}%`;
  if (kind === "amount" && value) return formatVnd(value);
  return "Không";
}
