import { formatAuditValue } from "./audit-view";
import { bookingPayMethods, collectedSplit, parsePaymentMethod } from "./sales";

export type ApprovalChange = {
  label: string;
  before: string;
  after: string;
};

type SnapshotRoom = {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  breakfast?: boolean;
  discountKind?: string;
  discountValue?: number;
};

type SnapshotExtra = {
  id: string;
  name: string;
  qty?: number;
  unitPrice?: number;
};

type Snapshot = {
  guestName?: string;
  guestPhone?: string;
  source?: string;
  otaPaymentMode?: string;
  otaCommissionKind?: string;
  otaCommissionValue?: number;
  invoiceRequested?: boolean;
  adults?: number;
  children?: number;
  breakfastAdults?: number;
  breakfastChildren?: number;
  cars?: number;
  bikes?: number;
  notes?: string;
  deposit?: number;
  checkinPaid?: number;
  checkinMethod?: string;
  cashPaid?: number;
  transferPaid?: number;
  companyPaid?: number;
  rooms?: SnapshotRoom[];
  extras?: SnapshotExtra[];
};

type Payload = {
  kind?: string;
  data?: Record<string, unknown>;
  saleId?: string;
  roomIds?: string[];
  extraId?: string;
};

const SCALAR_FIELDS = [
  "guestName",
  "guestPhone",
  "source",
  "otaPaymentMode",
  "otaCommissionKind",
  "otaCommissionValue",
  "invoiceRequested",
  "adults",
  "children",
  "breakfastAdults",
  "breakfastChildren",
  "cars",
  "bikes",
  "notes",
  "cashPaid",
  "transferPaid",
  "companyPaid",
] as const;

function roomName(roomId: string, numbers: Map<string, string>) {
  const number = numbers.get(roomId);
  return number ? `P.${number}` : "Phòng chưa rõ";
}

function discountText(kind: string | undefined, value: number | undefined) {
  if (!kind || kind === "none" || !value) return "—";
  if (kind === "percent") return `${value}%`;
  return formatAuditValue(value, "discountValue");
}

function extraText(extra: { name?: string; qty?: number; unitPrice?: number }) {
  const name = extra.name?.trim() || "Phụ thu";
  const qty = extra.qty ?? 1;
  const price = formatAuditValue(extra.unitPrice || 0, "unitPrice");
  return `${name} · ${qty} × ${price}`;
}

function push(rows: ApprovalChange[], label: string, before: string, after: string) {
  if (before === after) return;
  rows.push({ label, before, after });
}

export function approvalChanges(
  beforeJson: string,
  payloadJson: string,
  roomNumbers: Map<string, string> = new Map(),
): ApprovalChange[] {
  let before: Snapshot;
  let payload: Payload;
  try {
    before = JSON.parse(beforeJson) as Snapshot;
    payload = JSON.parse(payloadJson) as Payload;
  } catch {
    return [];
  }
  const rows: ApprovalChange[] = [];
  const rooms = before.rooms || [];

  if (payload.kind === "booking_update" && payload.data) {
    const data = payload.data;
    for (const key of SCALAR_FIELDS) {
      if (data[key] === undefined) continue;
      push(rows, fieldLabel(key), formatAuditValue(before[key], key), formatAuditValue(data[key], key));
    }
    const paid = collectedSplit(before.deposit || 0, before.checkinPaid);
    if (typeof data.deposit === "number") {
      push(rows, "Đặt cọc", formatAuditValue(paid.hold, "deposit"), formatAuditValue(data.deposit, "deposit"));
    }
    if (typeof data.checkinPaid === "number") {
      push(
        rows,
        "Thu đủ khi check-in",
        formatAuditValue(paid.checkin, "checkinPaid"),
        formatAuditValue(data.checkinPaid, "checkinPaid"),
      );
    }
    const methods = bookingPayMethods({
      deposit: before.deposit,
      cashPaid: before.cashPaid,
      transferPaid: before.transferPaid,
      companyPaid: before.companyPaid,
      checkinPaid: before.checkinPaid,
      checkinMethod: before.checkinMethod,
    });
    const hold = typeof data.deposit === "number" ? data.deposit : paid.hold;
    const checkin = typeof data.checkinPaid === "number" ? data.checkinPaid : paid.checkin;
    if (typeof data.paymentMethod === "string" && hold > 0) {
      push(
        rows,
        "Hình thức đặt cọc",
        formatAuditValue(methods.deposit, "paymentMethod"),
        formatAuditValue(parsePaymentMethod(data.paymentMethod), "paymentMethod"),
      );
    }
    if (typeof data.checkinPaymentMethod === "string" && checkin > 0) {
      push(
        rows,
        "Hình thức thu check-in",
        formatAuditValue(methods.checkin, "paymentMethod"),
        formatAuditValue(parsePaymentMethod(data.checkinPaymentMethod), "paymentMethod"),
      );
    }
    const removedIds = Array.isArray(data.removedSaleIds) ? data.removedSaleIds.map(String) : [];
    for (const id of removedIds) {
      const current = rooms.find((room) => room.id === id);
      push(rows, "Xóa phòng", current ? roomName(current.roomId, roomNumbers) : "Phòng", "—");
    }
    const assignments = Array.isArray(data.assignments) ? data.assignments : [];
    for (const raw of assignments) {
      const assignment = raw as {
        saleId?: string;
        roomId?: string;
        checkIn?: string;
        checkOut?: string;
        breakfast?: boolean;
        discountKind?: string;
        discountValue?: number;
      };
      const current = rooms.find((room) => room.id === assignment.saleId);
      if (!current || !assignment.roomId) continue;
      const prefix = rooms.length > 1 ? `${roomName(current.roomId, roomNumbers)} · ` : "";
      push(
        rows,
        `${prefix}Phòng`,
        roomName(current.roomId, roomNumbers),
        roomName(assignment.roomId, roomNumbers),
      );
      if (assignment.checkIn !== undefined) {
        push(rows, `${prefix}Ngày nhận`, formatAuditValue(current.checkIn, "checkIn"), formatAuditValue(assignment.checkIn, "checkIn"));
      }
      if (assignment.checkOut !== undefined) {
        push(rows, `${prefix}Ngày trả`, formatAuditValue(current.checkOut, "checkOut"), formatAuditValue(assignment.checkOut, "checkOut"));
      }
      if (assignment.breakfast !== undefined) {
        push(rows, `${prefix}Ăn sáng`, formatAuditValue(current.breakfast), formatAuditValue(assignment.breakfast));
      }
      if (assignment.discountKind !== undefined || assignment.discountValue !== undefined) {
        push(
          rows,
          `${prefix}Chiết khấu`,
          discountText(current.discountKind, current.discountValue),
          discountText(assignment.discountKind ?? current.discountKind, assignment.discountValue ?? current.discountValue),
        );
      }
    }
  }

  if (payload.kind === "move_room" && payload.data) {
    const data = payload.data as { saleId?: string; roomId?: string; checkIn?: string; checkOut?: string };
    const current = rooms.find((room) => room.id === data.saleId) || rooms[0];
    if (current && data.roomId) {
      push(rows, "Phòng", roomName(current.roomId, roomNumbers), roomName(data.roomId, roomNumbers));
      push(rows, "Ngày nhận", formatAuditValue(current.checkIn, "checkIn"), formatAuditValue(data.checkIn, "checkIn"));
      push(rows, "Ngày trả", formatAuditValue(current.checkOut, "checkOut"), formatAuditValue(data.checkOut, "checkOut"));
    }
  }

  if (payload.kind === "add_rooms" && payload.roomIds?.length) {
    push(rows, "Thêm phòng", "—", payload.roomIds.map((id) => roomName(id, roomNumbers)).join(" · "));
  }

  if (payload.kind === "add_extra" && payload.data) {
    const data = payload.data as { name?: string; qty?: number; unitPrice?: number };
    push(rows, "Thêm phụ thu", "—", extraText(data));
  }

  if (payload.kind === "remove_extra" && payload.extraId) {
    const extra = (before.extras || []).find((row) => row.id === payload.extraId);
    push(rows, "Xóa phụ thu", extra ? extraText(extra) : "Phụ thu", "—");
  }

  return rows;
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    guestName: "Khách",
    guestPhone: "Điện thoại",
    source: "Kênh đặt phòng",
    otaPaymentMode: "Thanh toán OTA",
    otaCommissionKind: "Cách tính hoa hồng",
    otaCommissionValue: "Mức hoa hồng",
    invoiceRequested: "Xuất hóa đơn",
    adults: "Người lớn",
    children: "Trẻ em",
    breakfastAdults: "Người lớn ăn sáng",
    breakfastChildren: "Trẻ em ăn sáng",
    cars: "Ô tô",
    bikes: "Xe máy",
    notes: "Ghi chú",
    cashPaid: "Tiền mặt",
    transferPaid: "CK cá nhân",
    companyPaid: "CK công ty",
  };
  return labels[key] || key;
}
