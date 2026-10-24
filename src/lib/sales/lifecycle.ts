import { guestCheckoutDue, isActiveSaleStatus, isOtaDebt, isOtaSource, otaMoneySplit } from "./status";
import { bookingInflowSplit } from "./transactions";

export const BOOKING_LIFE_STEPS = ["reserved", "checkin", "checkout"] as const;
export type BookingLifeStep = (typeof BOOKING_LIFE_STEPS)[number];
export type BookingLifePhase = BookingLifeStep | "cancelled" | "no_show";
export type BookingLifeState = "done" | "current" | "pending";

export const BOOKING_LIFE_STEP_LABEL: Record<BookingLifeStep, string> = {
  reserved: "Giữ chỗ",
  checkin: "Check-in",
  checkout: "Check-out",
};

export const BOOKING_LIFE_CHIP_LABEL: Record<BookingLifePhase, string> = {
  reserved: "Giữ chỗ",
  checkin: "Đang ở",
  checkout: "Đã trả",
  cancelled: "Hủy",
  no_show: "No-show",
};

export const BOOKING_LIFE_CHIP_TONE: Record<BookingLifePhase, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  checkin: "ok",
  checkout: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

export type BookingLifeInput = {
  status: string;
  deposit?: number | null;
  due?: number | null;
  source?: string | null;
  otaPaymentMode?: string | null;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  refundTotal?: number | null;
  transactions?: { kind: string; amount: number }[];
};

export type BookingLifeStepView = {
  id: BookingLifeStep;
  label: string;
  state: BookingLifeState;
};

export type BookingLifecycle = {
  phase: BookingLifePhase;
  otaDebt: boolean;
  otaHotel: boolean;
  paid: boolean;
  deposited: boolean;
  active: boolean;
  steps: BookingLifeStepView[];
};

function stepState(done: boolean, current: boolean): BookingLifeState {
  if (current) return "current";
  if (done) return "done";
  return "pending";
}

export function bookingLifecycle(booking: BookingLifeInput): BookingLifecycle {
  const status = booking.status;
  const otaDebt = isOtaDebt(booking.source, booking.otaPaymentMode);
  const otaHotel = isOtaSource(booking.source) && !otaDebt;
  const collected = Math.max(0, Math.round(booking.deposit || 0));
  const inflow = booking.transactions?.length ? bookingInflowSplit(booking.transactions) : null;
  const paid = guestCheckoutDue(booking.due, booking.source, booking.otaPaymentMode, {
    roomTotal: booking.roomTotal,
    extrasTotal: booking.extrasTotal,
    deposit: booking.deposit,
    refunded: booking.refundTotal ?? inflow?.refunded,
    guestCollected: inflow?.guestCollected,
    otaCollected: inflow?.otaCollected,
  }) <= 0;
  const deposited = otaDebt
    ? otaMoneySplit({
        source: booking.source,
        otaPaymentMode: booking.otaPaymentMode,
        roomTotal: booking.roomTotal,
        extrasTotal: booking.extrasTotal,
        deposit: booking.deposit,
        refunded: booking.refundTotal ?? inflow?.refunded,
        guestCollected: inflow?.guestCollected,
        otaCollected: inflow?.otaCollected,
      }).guestCollected > 0
    : collected > 0;
  const active = isActiveSaleStatus(status);
  const checkedIn = status === "inhouse" || status === "departed";
  const checkedOut = status === "departed";

  let phase: BookingLifePhase = "reserved";
  if (status === "cancelled") phase = "cancelled";
  else if (status === "no_show") phase = "no_show";
  else if (checkedOut) phase = "checkout";
  else if (checkedIn) phase = "checkin";

  const steps: BookingLifeStepView[] = [
    { id: "reserved", label: BOOKING_LIFE_STEP_LABEL.reserved, state: stepState(true, phase === "reserved") },
    { id: "checkin", label: BOOKING_LIFE_STEP_LABEL.checkin, state: stepState(checkedIn, phase === "checkin") },
    { id: "checkout", label: BOOKING_LIFE_STEP_LABEL.checkout, state: stepState(checkedOut, phase === "checkout") },
  ];

  return { phase, otaDebt, otaHotel, paid, deposited, active, steps };
}

export function bookingLifeChip(life: BookingLifecycle) {
  return { label: BOOKING_LIFE_CHIP_LABEL[life.phase], tone: BOOKING_LIFE_CHIP_TONE[life.phase] };
}
