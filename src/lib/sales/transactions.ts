import { dateStartISO, paidOnVN } from "../datetime";
import type { PaymentMethod } from "../types";
import { bookingPayMethods, collectedSplit, depositMethodOf, formatVnd, isPaymentMethod, parsePaymentMethod, primaryPaymentMethod, salePaid } from "./money";
import { bookingKey, isActiveSaleStatus, isOtaDebt, otaMoneySplit } from "./status";

export const BOOKING_TX_KINDS = ["deposit", "checkin", "payment", "ota", "refund"] as const;
export type BookingTxKind = (typeof BOOKING_TX_KINDS)[number];

export const BOOKING_TX_KIND_LABEL: Record<BookingTxKind, string> = {
  deposit: "Đặt cọc",
  checkin: "Thu đủ khi check-in",
  payment: "Thu thêm",
  ota: "Nhận OTA",
  refund: "Hoàn tiền",
};

export type BookingTxInput = {
  kind: string;
  amount: number;
  method: string;
  paidAt?: string | null;
  paidOn?: string | null;
};

export type BookingPaidProjection = {
  deposit: number;
  checkinPaid: number;
  cashPaid: number;
  transferPaid: number;
  companyPaid: number;
  refundCash: number;
  refundTransfer: number;
  refundCompany: number;
  refundTotal: number;
  refundedAt: string | null;
  checkinMethod: string;
};

export function isBookingTxKind(value: string | null | undefined): value is BookingTxKind {
  return BOOKING_TX_KINDS.includes(String(value || "") as BookingTxKind);
}

export function isInflowTxKind(kind: string) {
  return kind === "deposit" || kind === "checkin" || kind === "payment" || kind === "ota";
}

export function isGuestInflowTxKind(kind: string) {
  return kind === "deposit" || kind === "checkin" || kind === "payment";
}

export type BookingCollectedLine = {
  key: string;
  label: string;
  amount: number;
  method: PaymentMethod;
};

const COLLECTED_LINE_LABEL = {
  deposit: "Đã đặt cọc",
  checkin: "Thu đủ khi check-in",
  payment: "Thu thêm",
} as const;

/** One summary row per kind and account, in transaction order. */
export function bookingCollectedLines(
  txs: { kind: string; amount: number; method: string }[],
  opts?: { depositLabel?: string },
): BookingCollectedLine[] {
  const depositLabel = opts?.depositLabel || COLLECTED_LINE_LABEL.deposit;
  const lines: BookingCollectedLine[] = [];
  for (const tx of txs) {
    if (tx.kind !== "deposit" && tx.kind !== "checkin" && tx.kind !== "payment") continue;
    const amount = Math.max(0, Math.round(tx.amount || 0));
    if (!amount) continue;
    const method = isPaymentMethod(tx.method) ? tx.method : parsePaymentMethod(tx.method);
    const key = `${tx.kind}:${method}`;
    const found = lines.find((row) => row.key === key);
    if (found) found.amount += amount;
    else lines.push({
      key,
      label: tx.kind === "deposit" ? depositLabel : COLLECTED_LINE_LABEL[tx.kind],
      amount,
      method,
    });
  }
  return lines;
}

/** Split inflows so OTA settle does not count as guest phụ thu. */
export function bookingInflowSplit(txs: { kind: string; amount: number }[]) {
  let guest = 0;
  let ota = 0;
  let refund = 0;
  for (const tx of txs) {
    const amount = Math.max(0, Math.round(tx.amount || 0));
    if (!amount) continue;
    if (tx.kind === "refund") refund += amount;
    else if (tx.kind === "ota") ota += amount;
    else if (isGuestInflowTxKind(tx.kind)) guest += amount;
  }
  const guestCollected = Math.max(0, guest - refund);
  const refundLeft = Math.max(0, refund - guest);
  return {
    guestCollected,
    otaCollected: Math.max(0, ota - refundLeft),
    refunded: refund,
  };
}

export function parsePhotoData(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (!value.startsWith("data:image/")) throw new Error("Ảnh không hợp lệ");
  if (value.length > 280_000) throw new Error("Ảnh quá lớn, chọn ảnh nhỏ hơn");
  return value;
}

export function projectBookingPaid(txs: BookingTxInput[]): BookingPaidProjection {
  let deposit = 0;
  let checkinPaid = 0;
  let cashPaid = 0;
  let transferPaid = 0;
  let companyPaid = 0;
  let refundCash = 0;
  let refundTransfer = 0;
  let refundCompany = 0;
  let refundedAt: string | null = null;
  let checkinMethod = "";
  for (const tx of txs) {
    const amount = Math.max(0, Math.round(tx.amount || 0));
    if (!amount) continue;
    const method = parsePaymentMethod(tx.method);
    if (tx.kind === "refund") {
      if (method === "cash") refundCash += amount;
      else if (method === "company") refundCompany += amount;
      else refundTransfer += amount;
      const on = tx.paidOn || paidOnVN(tx.paidAt);
      if (on && (!refundedAt || on < refundedAt)) refundedAt = on;
      continue;
    }
    if (!isInflowTxKind(tx.kind)) continue;
    deposit += amount;
    if (tx.kind !== "deposit") {
      checkinPaid += amount;
      checkinMethod = method;
    }
    if (method === "cash") cashPaid += amount;
    else if (method === "company") companyPaid += amount;
    else transferPaid += amount;
  }
  return {
    deposit,
    checkinPaid,
    cashPaid,
    transferPaid,
    companyPaid,
    refundCash,
    refundTransfer,
    refundCompany,
    refundTotal: refundCash + refundTransfer + refundCompany,
    refundedAt,
    checkinMethod,
  };
}

export function canSettleOtaDebt(booking: {
  source?: string | null;
  otaPaymentMode?: string | null;
  due?: number | null;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  deposit?: number | null;
  refundTotal?: number | null;
  otaCommissionKind?: string | null;
  otaCommissionValue?: number | null;
  otaCommissionPercent?: number | null;
  transactions?: { kind: string; amount: number }[];
  rooms: { status: string }[];
}) {
  if (!isOtaDebt(booking.source, booking.otaPaymentMode)) return false;
  if (booking.rooms.some((row) => isActiveSaleStatus(row.status))) return false;
  if (!booking.rooms.some((row) => row.status === "departed")) return false;
  const inflow = booking.transactions?.length ? bookingInflowSplit(booking.transactions) : null;
  const split = otaMoneySplit({
    source: booking.source,
    otaPaymentMode: booking.otaPaymentMode,
    roomTotal: booking.roomTotal ?? Math.max(0, Math.round(booking.due || 0)),
    extrasTotal: booking.extrasTotal ?? 0,
    deposit: booking.deposit,
    refunded: booking.refundTotal ?? inflow?.refunded,
    guestCollected: inflow?.guestCollected,
    otaCollected: inflow?.otaCollected,
    otaCommissionKind: booking.otaCommissionKind,
    otaCommissionValue: booking.otaCommissionValue,
    otaCommissionPercent: booking.otaCommissionPercent,
  });
  return split.otaDue > 0;
}

export type BackfillSale = {
  id: string;
  bookingId?: string | null;
  source?: string | null;
  otaPaymentMode?: string | null;
  deposit?: number | null;
  checkinPaid?: number | null;
  checkinMethod?: string | null;
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
  refundCash?: number | null;
  refundTransfer?: number | null;
  refundCompany?: number | null;
  refundedAt?: string | null;
  createdAt: string;
  createdBy?: string | null;
  checkIn: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  updatedAt?: string | null;
};

export type BackfillTx = {
  kind: BookingTxKind;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  paidOn: string;
  note: string;
  photo: null;
  createdBy: string | null;
};

function headSale(rooms: BackfillSale[]) {
  return [...rooms].sort((a, b) => (b.deposit || 0) - (a.deposit || 0) || a.createdAt.localeCompare(b.createdAt))[0];
}

function methodOf(value: string | null | undefined, fallback: PaymentMethod): PaymentMethod {
  return isPaymentMethod(String(value || "")) ? (value as PaymentMethod) : fallback;
}

export function backfillTxsForBooking(rooms: BackfillSale[]): BackfillTx[] {
  if (!rooms.length) return [];
  const head = headSale(rooms);
  const collected = Math.max(0, Math.round(head.deposit || 0));
  const paid = salePaid(head);
  const split = collectedSplit(collected, head.checkinPaid);
  const methods = bookingPayMethods(head);
  const holdMethod = depositMethodOf(head, head.checkinPaid, head.checkinMethod);
  const rows: BackfillTx[] = [];
  const createdBy = head.createdBy || null;

  if (isOtaDebt(head.source, head.otaPaymentMode)) {
    if (collected > 0) {
      const paidAt = head.checkedOutAt || head.updatedAt || head.createdAt;
      const paidOn = paidOnVN(paidAt);
      rows.push({
        kind: "ota",
        amount: collected,
        method: paid.companyPaid >= paid.transferPaid && paid.companyPaid >= paid.cashPaid && paid.companyPaid > 0
          ? "company"
          : primaryPaymentMethod(paid),
        paidAt,
        paidOn,
        note: "",
        photo: null,
        createdBy,
      });
    }
  } else {
    if (split.hold > 0) {
      rows.push({
        kind: "deposit",
        amount: split.hold,
        method: holdMethod,
        paidAt: head.createdAt,
        paidOn: paidOnVN(head.createdAt),
        note: "",
        photo: null,
        createdBy,
      });
    }
    if (split.checkin > 0) {
      const paidAt = head.checkedInAt || dateStartISO(head.checkIn);
      rows.push({
        kind: "checkin",
        amount: split.checkin,
        method: methodOf(head.checkinMethod, methods.checkin),
        paidAt,
        paidOn: paidOnVN(paidAt),
        note: "",
        photo: null,
        createdBy,
      });
    }
  }

  const refundOn = paidOnVN(head.refundedAt) || paidOnVN(head.updatedAt);
  const refundAt = head.refundedAt ? dateStartISO(head.refundedAt) : head.updatedAt || head.createdAt;
  if (head.refundCompany) {
    rows.push({ kind: "refund", amount: Math.round(head.refundCompany), method: "company", paidAt: refundAt, paidOn: refundOn, note: "", photo: null, createdBy });
  }
  if (head.refundTransfer) {
    rows.push({ kind: "refund", amount: Math.round(head.refundTransfer), method: "personal", paidAt: refundAt, paidOn: refundOn, note: "", photo: null, createdBy });
  }
  if (head.refundCash) {
    rows.push({ kind: "refund", amount: Math.round(head.refundCash), method: "cash", paidAt: refundAt, paidOn: refundOn, note: "", photo: null, createdBy });
  }
  return rows.filter((row) => row.amount > 0);
}

export type DepositEditPlan =
  | { ok: true; op: "noop" }
  | { ok: true; op: "update" | "delete"; txId: string; amount: number }
  | { ok: true; op: "insert"; amount: number }
  | { ok: true; op: "columns"; amount: number }
  | { ok: false; message: string };

function inflowAfterDeposit(
  txs: { id: string; kind: string; amount: number }[],
  exceptId: string | null,
  replacement: number,
) {
  let guest = 0;
  let refund = 0;
  let seen = !exceptId;
  for (const tx of txs) {
    if (exceptId && tx.id === exceptId) {
      guest += Math.max(0, Math.round(replacement || 0));
      seen = true;
      continue;
    }
    const amount = Math.max(0, Math.round(tx.amount || 0));
    if (!amount) continue;
    if (tx.kind === "refund") refund += amount;
    else if (isGuestInflowTxKind(tx.kind)) guest += amount;
  }
  if (!seen) return null;
  if (!exceptId) guest += Math.max(0, Math.round(replacement || 0));
  return { guest, refund };
}

/** How a manager's deposit correction is stored: one deposit row, a new row, or the legacy paid columns. */
export function depositEditPlan(input: {
  transactions: { id: string; kind: string; amount: number }[];
  txId?: string;
  amount: number;
  otaDebt?: boolean;
  checkinPaid?: number;
  refunded?: number;
}): DepositEditPlan {
  const amount = Math.max(0, Math.round(input.amount || 0));
  const txs = input.transactions || [];
  const deposits = txs.filter((tx) => tx.kind === "deposit" && Math.round(tx.amount || 0) > 0);
  const refunded = Math.max(0, Math.round(input.refunded || 0));
  const checkinPaid = Math.max(0, Math.round(input.checkinPaid || 0));

  function tooLow(guest: number, refundFromTxs = 0): DepositEditPlan | null {
    const floor = Math.max(refunded, refundFromTxs);
    if (guest >= floor) return null;
    return { ok: false, message: `Không giảm cọc dưới số đã hoàn ${formatVnd(floor)}` };
  }

  if (input.txId) {
    const tx = txs.find((row) => row.id === input.txId);
    if (!tx || tx.kind !== "deposit") return { ok: false, message: "Không tìm thấy khoản đặt cọc" };
    const after = inflowAfterDeposit(txs, tx.id, amount);
    if (!after) return { ok: false, message: "Không tìm thấy khoản đặt cọc" };
    const low = tooLow(after.guest, after.refund);
    if (low) return low;
    if (!amount) return { ok: true, op: "delete", txId: tx.id, amount: 0 };
    return { ok: true, op: "update", txId: tx.id, amount };
  }

  if (deposits.length > 1) {
    return { ok: false, message: "Booking có nhiều khoản cọc. Sửa từng khoản trong danh sách giao dịch." };
  }
  if (deposits.length === 1) return depositEditPlan({ ...input, txId: deposits[0].id });

  if (txs.length) {
    if (input.otaDebt) return { ok: false, message: "Booking công nợ OTA không ghi đặt cọc" };
    if (!amount) return { ok: true, op: "noop" };
    const after = inflowAfterDeposit(txs, null, amount);
    const low = tooLow(after?.guest || amount, after?.refund || 0);
    if (low) return low;
    return { ok: true, op: "insert", amount };
  }

  if (input.otaDebt) return { ok: false, message: "Booking công nợ OTA không ghi đặt cọc" };
  const low = tooLow(amount + checkinPaid);
  if (low) return low;
  return { ok: true, op: "columns", amount };
}

export function groupSalesForBackfill(sales: BackfillSale[]) {
  const groups = new Map<string, BackfillSale[]>();
  for (const sale of sales) {
    const key = bookingKey(sale);
    if (!key || key.startsWith("seq-hold-")) continue;
    const list = groups.get(key) || [];
    list.push(sale);
    groups.set(key, list);
  }
  return groups;
}