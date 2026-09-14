export type StayOpsItem = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
};

type StayForChecklist = {
  status: string;
  pmsBookingOk: boolean | number | null;
  pmsCheckinOk: boolean | number | null;
  pmsCheckoutOk: boolean | number | null;
  invoiceOk: boolean | number | null;
  registrationDoneAt: string | null;
  room: { hkStatus: string; opsStatus: string } | null;
  vehicles: unknown[];
  requests: { status: string }[];
  tasks?: { status: string }[];
};

function flagged(value: boolean | number | null | undefined) {
  return value === true || value === 1;
}

export function stayOpsChecklist(stay: StayForChecklist): StayOpsItem[] {
  const roomReady = stay.room
    ? stay.room.hkStatus === "ins" || stay.room.opsStatus === "ins" || stay.room.opsStatus === "vacant_clean"
    : false;
  const hkAfterCheckout = stay.room
    ? ["waiting", "accepted", "cleaning", "waiting_inspect"].includes(stay.room.hkStatus) ||
      ["vacant_dirty", "cleaning", "waiting_inspect"].includes(stay.room.opsStatus)
    : false;
  const requestsDone =
    stay.requests.every((r) => r.status !== "open") &&
    (stay.tasks ?? []).every((task) => ["done", "checked", "archive"].includes(task.status));
  const hasVehicle = stay.vehicles.length > 0;

  if (stay.status === "arriving" || stay.status === "no_show") {
    return [
      { key: "booking", label: "Đã nhập booking trên ezCloudhotel", done: flagged(stay.pmsBookingOk), required: true },
      { key: "room", label: "Phòng INS / sẵn sàng nhận", done: roomReady, required: true },
      { key: "checkin", label: "Đã check-in PMS", done: flagged(stay.pmsCheckinOk), required: true },
      { key: "vehicle", label: "Ghi gửi xe nếu khách có xe", done: hasVehicle, required: false },
    ];
  }
  if (stay.status === "inhouse") {
    return [
      { key: "booking", label: "Đã nhập booking trên ezCloudhotel", done: flagged(stay.pmsBookingOk), required: true },
      { key: "checkin", label: "Đã check-in PMS", done: flagged(stay.pmsCheckinOk), required: true },
      { key: "reg", label: "Đã đăng ký lưu trú", done: !!stay.registrationDoneAt, required: true },
      { key: "vehicle", label: "Ghi gửi xe nếu khách có xe", done: hasVehicle, required: false },
      { key: "requests", label: "Yêu cầu khách (khăn, dọn, …) đã xử lý hết", done: requestsDone, required: true },
    ];
  }
  if (stay.status === "departing") {
    return [
      { key: "invoice", label: "Đã xuất hóa đơn", done: flagged(stay.invoiceOk), required: true },
      { key: "checkout", label: "Đã check-out PMS", done: flagged(stay.pmsCheckoutOk), required: true },
      { key: "vehicle", label: "Xe / chìa đã ghi nhận", done: hasVehicle, required: false },
      { key: "hk", label: "Đã gửi HK dọn phòng trả", done: hkAfterCheckout, required: true },
    ];
  }
  return [];
}
