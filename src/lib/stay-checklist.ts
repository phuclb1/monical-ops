import type { StayStatus } from "./types";

export type StayOpsItem = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
};

type StayForChecklist = {
  status: string;
  arrivalDate?: string;
  departureDate?: string;
  pmsBookingOk: boolean | number | null;
  pmsCheckinOk: boolean | number | null;
  pmsCheckoutOk: boolean | number | null;
  invoiceRequested?: boolean | number | null;
  invoiceOk: boolean | number | null;
  registrationDoneAt: string | null;
  room: { hkStatus: string; opsStatus: string } | null;
  vehicles: unknown[];
  requests: { status: string }[];
  tasks?: { kind?: string; status: string }[];
};

function flagged(value: boolean | number | null | undefined) {
  return value === true || value === 1;
}

export function stayBoardStatus(
  stay: { status: string; arrivalDate: string; departureDate: string },
  date: string,
): StayStatus {
  if (stay.status === "departed" || stay.status === "no_show") return stay.status as StayStatus;
  if (stay.status === "arriving") return "arriving";
  if (stay.departureDate <= date && (stay.status === "inhouse" || stay.status === "departing")) return "departing";
  if (stay.status === "departing") return "departing";
  return "inhouse";
}

export function stayOpsChecklist(stay: StayForChecklist, date?: string): StayOpsItem[] {
  const board =
    stay.arrivalDate && stay.departureDate && date
      ? stayBoardStatus({ status: stay.status, arrivalDate: stay.arrivalDate, departureDate: stay.departureDate }, date)
      : stay.status;
  const roomReady = stay.room
    ? stay.room.hkStatus === "ins" || stay.room.opsStatus === "ins" || stay.room.opsStatus === "vacant_clean"
    : false;
  const hkAfterCheckout =
    (stay.room
      ? ["waiting", "accepted", "cleaning", "waiting_inspect"].includes(stay.room.hkStatus) ||
        ["vacant_dirty", "cleaning", "waiting_inspect"].includes(stay.room.opsStatus)
      : false) ||
    (stay.tasks ?? []).some((task) => task.kind === "checkout_clean" && task.status !== "archive");
  const requestsDone =
    stay.requests.every((r) => r.status !== "open") &&
    (stay.tasks ?? [])
      .filter((task) => task.kind !== "checkin" && task.kind !== "checkout" && task.kind !== "checkout_clean")
      .every((task) => ["done", "checked", "archive"].includes(task.status));
  const hasVehicle = stay.vehicles.length > 0;

  if (board === "arriving" || board === "no_show") {
    return [
      { key: "booking", label: "Đã nhập booking trên ezCloudhotel", done: flagged(stay.pmsBookingOk), required: true },
      { key: "room", label: "Phòng INS / sẵn sàng nhận", done: roomReady, required: true },
      { key: "checkin", label: "Đã check-in PMS", done: flagged(stay.pmsCheckinOk), required: true },
      { key: "vehicle", label: "Ghi gửi xe nếu khách có xe", done: hasVehicle, required: false },
    ];
  }
  if (board === "inhouse") {
    return [
      { key: "booking", label: "Đã nhập booking trên ezCloudhotel", done: flagged(stay.pmsBookingOk), required: true },
      { key: "checkin", label: "Đã check-in PMS", done: flagged(stay.pmsCheckinOk), required: true },
      { key: "reg", label: "Đã đăng ký lưu trú", done: !!stay.registrationDoneAt, required: true },
      { key: "vehicle", label: "Ghi gửi xe nếu khách có xe", done: hasVehicle, required: false },
      { key: "requests", label: "Yêu cầu khách (khăn, dọn, …) đã xử lý hết", done: requestsDone, required: true },
    ];
  }
  if (board === "departing") {
    return [
      ...(flagged(stay.invoiceRequested)
        ? [{ key: "invoice", label: "Đã xuất hóa đơn", done: flagged(stay.invoiceOk), required: true }]
        : []),
      { key: "checkout", label: "Đã check-out PMS", done: flagged(stay.pmsCheckoutOk), required: true },
      { key: "vehicle", label: "Xe / chìa đã ghi nhận", done: hasVehicle, required: false },
      { key: "hk", label: "Đã gửi HK dọn phòng trả", done: hkAfterCheckout, required: true },
    ];
  }
  return [];
}
