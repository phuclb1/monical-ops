import type { PaymentMethod } from "../types";
import { PAYMENT_METHODS } from "../types";

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

export function bookingDue(total: number, deposit: number) {
  return Math.max(0, Math.round(total || 0) - Math.max(0, Math.round(deposit || 0)));
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

export function primaryPaymentMethod(row: PaidSplit): PaymentMethod {
  const paid = salePaid(row);
  if (paid.companyPaid >= paid.transferPaid && paid.companyPaid >= paid.cashPaid && paid.companyPaid > 0) return "company";
  if (paid.cashPaid >= paid.transferPaid && paid.cashPaid > 0) return "cash";
  return "personal";
}

export function paidNote(row: PaidSplit) {
  const paid = salePaid(row);
  const parts: string[] = [];
  if (paid.companyPaid) parts.push(`CK công ty ${formatVnd(paid.companyPaid)}`);
  if (paid.transferPaid) parts.push(`CK cá nhân ${formatVnd(paid.transferPaid)}`);
  if (paid.cashPaid) parts.push(`tiền mặt ${formatVnd(paid.cashPaid)}`);
  return parts.join(" · ");
}

export function discountLabel(kind: string | null | undefined, value: number | null | undefined) {
  if (kind === "percent" && value) return `${value}%`;
  if (kind === "amount" && value) return formatVnd(value);
  return "Không";
}
