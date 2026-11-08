import { depositMethodOf } from "./sales/money";
import { bookingInflowSplit, canSettleOtaDebt } from "./sales/transactions";
import { isActiveSaleStatus, isOtaDebt, isOtaSource, otaMoneySplit, rangesOverlap } from "./sales/status";

export const CONTROL_ISSUE_KINDS = [
  "underpaid",
  "arrival_overdue",
  "checkout_overdue",
  "ota_unsettled",
  "approval_pending",
  "room_overlap",
  "zero_total",
  "over_refund",
  "bad_deposit_method",
  "ota_phone_missing",
] as const;

export const CONTROL_PUSH_INTERVAL_MS = 30 * 60 * 1000;
/** Kiểm soát bắt đầu từ booking nhận phòng tháng 11/2026. */
export const CONTROL_FROM = "2026-11-01";

export type ControlIssueKind = (typeof CONTROL_ISSUE_KINDS)[number];

export const CONTROL_ISSUE_LABEL: Record<ControlIssueKind, string> = {
  underpaid: "Thu thiếu tiền",
  arrival_overdue: "Quá hạn chưa đến",
  checkout_overdue: "Quá ngày trả",
  ota_unsettled: "Công nợ OTA",
  approval_pending: "Chờ duyệt sửa",
  room_overlap: "Trùng phòng",
  zero_total: "Tổng tiền bằng 0",
  over_refund: "Hoàn vượt tiền thu",
  bad_deposit_method: "Cọc sai tài khoản",
  ota_phone_missing: "OTA thiếu điện thoại",
};

export const CONTROL_ISSUE_TONE: Record<ControlIssueKind, "danger" | "warn" | "gold"> = {
  underpaid: "danger",
  arrival_overdue: "danger",
  checkout_overdue: "danger",
  ota_unsettled: "warn",
  approval_pending: "gold",
  room_overlap: "danger",
  zero_total: "warn",
  over_refund: "danger",
  bad_deposit_method: "warn",
  ota_phone_missing: "warn",
};

export type ControlRoom = {
  id: string;
  roomId: string;
  status: string;
  checkIn: string;
  checkOut: string;
  checkedInAt?: string | null;
  room?: { number?: string | null } | null;
};

export type ControlTransaction = {
  id: string;
  kind: string;
  amount: number;
  method: string;
  paidAt?: string | null;
};

export type ControlBooking = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  pmsCode?: string | null;
  roomLabel?: string | null;
  source?: string | null;
  otaPaymentMode?: string | null;
  total: number;
  due: number;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  otaCommissionKind?: string | null;
  otaCommissionValue?: number | null;
  otaCommissionPercent?: number | null;
  deposit?: number | null;
  checkinPaid?: number | null;
  checkinMethod?: string | null;
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
  refundTotal?: number | null;
  checkIn: string;
  checkOut: string;
  rooms: ControlRoom[];
  transactions?: ControlTransaction[];
};

export type PendingControlApproval = {
  id: string;
  bookingId: string;
  summary: string;
  requestedAt: string;
};

export type ControlIssue = {
  fingerprint: string;
  kind: ControlIssueKind;
  bookingId: string;
  guestName: string;
  bookingCode: string;
  roomLabel: string;
  detail: string;
  amount?: number;
  date?: string;
  manualResolve: boolean;
};

function codeOf(booking: ControlBooking) {
  return booking.pmsCode?.trim() || booking.id.slice(0, 8);
}

function roomLabelOf(booking: ControlBooking) {
  return booking.roomLabel?.trim() || booking.rooms.map((room) => `P.${room.room?.number || "—"}`).join(" · ");
}

function issue(
  booking: ControlBooking,
  kind: ControlIssueKind,
  detail: string,
  extra: Partial<Pick<ControlIssue, "fingerprint" | "amount" | "date" | "manualResolve">> = {},
): ControlIssue {
  return {
    fingerprint: extra.fingerprint || `${kind}:${booking.id}`,
    kind,
    bookingId: booking.id,
    guestName: booking.guestName,
    bookingCode: codeOf(booking),
    roomLabel: roomLabelOf(booking),
    detail,
    amount: extra.amount,
    date: extra.date,
    manualResolve: extra.manualResolve ?? true,
  };
}

function splitOtaMoney(booking: ControlBooking) {
  const inflow = booking.transactions?.length ? bookingInflowSplit(booking.transactions) : null;
  return otaMoneySplit({
    source: booking.source,
    otaPaymentMode: booking.otaPaymentMode,
    roomTotal: booking.roomTotal,
    extrasTotal: booking.extrasTotal,
    deposit: booking.deposit,
    refunded: booking.refundTotal ?? inflow?.refunded,
    guestCollected: inflow?.guestCollected,
    otaCollected: inflow?.otaCollected,
    otaCommissionKind: booking.otaCommissionKind,
    otaCommissionValue: booking.otaCommissionValue,
    otaCommissionPercent: booking.otaCommissionPercent,
  });
}

function controlCheckIn(booking: ControlBooking) {
  return [booking.checkIn, ...booking.rooms.map((room) => room.checkIn)]
    .map((value) => String(value || "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort()[0] || "";
}

export function inControlPeriod(booking: ControlBooking) {
  const checkIn = controlCheckIn(booking);
  return Boolean(checkIn) && checkIn >= CONTROL_FROM;
}

function isRecentClosed(booking: ControlBooking, cutoff: string) {
  return booking.rooms.some((room) => room.status === "departed" && room.checkOut >= cutoff);
}

function firstCheckedInAt(booking: ControlBooking) {
  return booking.rooms
    .map((room) => room.checkedInAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
}

export function findControlIssues(
  bookings: ControlBooking[],
  approvals: PendingControlApproval[],
  now = new Date(),
  today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now),
): ControlIssue[] {
  const issues: ControlIssue[] = [];
  const watched = bookings.filter(inControlPeriod);
  const cutoff = new Date(`${today}T12:00:00+07:00`);
  cutoff.setDate(cutoff.getDate() - 90);
  const closedCutoff = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(cutoff);
  const byId = new Map(watched.map((booking) => [booking.id, booking]));

  for (const booking of watched) {
    const active = booking.rooms.some((room) => isActiveSaleStatus(room.status));
    const inhouse = booking.rooms.some((room) => room.status === "inhouse");
    const recentClosed = isRecentClosed(booking, closedCutoff);
    const otaDebt = isOtaDebt(booking.source, booking.otaPaymentMode);
    const otaSplit = splitOtaMoney(booking);
    const guestDue = otaDebt ? otaSplit.guestDue : Math.max(0, Math.round(booking.due || 0));

    if ((inhouse || recentClosed) && guestDue > 0) {
      issues.push(issue(booking, "underpaid", `Khách còn phải trả ${guestDue.toLocaleString("vi-VN")}₫`, { amount: guestDue }));
    }

    const lateArrivalRooms = booking.rooms.filter((room) => room.status === "reserved" && room.checkIn < today);
    if (lateArrivalRooms.length) {
      issues.push(issue(booking, "arrival_overdue", `${lateArrivalRooms.length} phòng vẫn đang giữ sau ngày nhận`, { date: lateArrivalRooms[0].checkIn }));
    }

    const lateCheckoutRooms = booking.rooms.filter((room) => room.status === "inhouse" && room.checkOut < today);
    if (lateCheckoutRooms.length) {
      issues.push(issue(booking, "checkout_overdue", `${lateCheckoutRooms.length} phòng chưa checkout`, { date: lateCheckoutRooms[0].checkOut }));
    }

    if (recentClosed && otaDebt && canSettleOtaDebt(booking) && otaSplit.otaDue > 0) {
      issues.push(issue(booking, "ota_unsettled", `OTA còn phải trả ${otaSplit.otaDue.toLocaleString("vi-VN")}₫`, { amount: otaSplit.otaDue }));
    }

    if (active && Math.round(booking.total || 0) <= 0) {
      issues.push(issue(booking, "zero_total", "Booking đang hoạt động nhưng tổng phải thu bằng 0"));
    }

    const refunded = Math.max(0, Math.round(booking.refundTotal || 0));
    const collected = Math.max(0, Math.round(booking.deposit || 0));
    if ((active || recentClosed) && refunded > collected) {
      issues.push(issue(booking, "over_refund", `Đã hoàn vượt ${(refunded - collected).toLocaleString("vi-VN")}₫`, { amount: refunded - collected }));
    }

    const depositTransactions = (booking.transactions || []).filter((tx) => tx.kind === "deposit" && tx.amount > 0);
    if (depositTransactions.length) {
      for (const tx of depositTransactions) {
        if (tx.method === "company") continue;
        issues.push(issue(booking, "bad_deposit_method", `Cọc ${tx.amount.toLocaleString("vi-VN")}₫ không qua CK công ty`, {
          fingerprint: `bad_deposit_method:${booking.id}:${tx.id}`,
          amount: tx.amount,
          date: tx.paidAt || undefined,
        }));
      }
    } else {
      const hold = Math.max(0, collected - Math.max(0, Math.round(booking.checkinPaid || 0)));
      if (hold > 0 && depositMethodOf(booking, booking.checkinPaid, booking.checkinMethod) !== "company") {
        issues.push(issue(booking, "bad_deposit_method", `Cọc cũ ${hold.toLocaleString("vi-VN")}₫ không qua CK công ty`, {
          fingerprint: `bad_deposit_method:${booking.id}:legacy`,
          amount: hold,
        }));
      }
    }

    if (isOtaSource(booking.source) && inhouse && !booking.guestPhone?.trim()) {
      const checkedInAt = firstCheckedInAt(booking);
      if (checkedInAt && now.getTime() - new Date(checkedInAt).getTime() >= 60 * 60 * 1000) {
        issues.push(issue(booking, "ota_phone_missing", "Đã check-in hơn 1 giờ nhưng chưa có số điện thoại khách", { date: checkedInAt }));
      }
    }
  }

  for (const approval of approvals) {
    const booking = byId.get(approval.bookingId);
    if (!booking) continue;
    issues.push(issue(booking, "approval_pending", approval.summary, {
      fingerprint: `approval_pending:${approval.id}`,
      date: approval.requestedAt,
    }));
  }

  const activeRooms = watched.flatMap((booking) =>
    booking.rooms
      .filter((room) => isActiveSaleStatus(room.status))
      .map((room) => ({ booking, room })),
  );
  for (let left = 0; left < activeRooms.length; left += 1) {
    for (let right = left + 1; right < activeRooms.length; right += 1) {
      const a = activeRooms[left];
      const b = activeRooms[right];
      if (a.booking.id === b.booking.id || a.room.roomId !== b.room.roomId) continue;
      if (!rangesOverlap(a.room.checkIn, a.room.checkOut, b.room.checkIn, b.room.checkOut)) continue;
      const ids = [a.booking.id, b.booking.id].sort();
      issues.push(issue(a.booking, "room_overlap", `Trùng lịch với booking ${codeOf(b.booking)}`, {
        fingerprint: `room_overlap:${a.room.roomId}:${ids[0]}:${ids[1]}`,
        date: a.room.checkIn > b.room.checkIn ? a.room.checkIn : b.room.checkIn,
      }));
    }
  }

  return issues.sort((a, b) => a.kind.localeCompare(b.kind) || (a.date || "").localeCompare(b.date || "") || a.bookingCode.localeCompare(b.bookingCode));
}

export function summarizeControlIssues(issues: ControlIssue[]) {
  const counts = new Map<ControlIssueKind, number>();
  for (const issue of issues) counts.set(issue.kind, (counts.get(issue.kind) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || CONTROL_ISSUE_LABEL[a[0]].localeCompare(CONTROL_ISSUE_LABEL[b[0]], "vi"))
    .map(([kind, count]) => `${count} ${CONTROL_ISSUE_LABEL[kind].toLowerCase()}`)
    .join(" · ");
}

export function controlPushDue(lastPushAt: string | null | undefined, now: Date) {
  if (!lastPushAt) return true;
  const last = new Date(lastPushAt).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= CONTROL_PUSH_INTERVAL_MS;
}
