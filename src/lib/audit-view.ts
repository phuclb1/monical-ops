import { DISCOUNT_KIND_LABEL, SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "./constants";
import { TZ } from "./datetime";

export const INGEST_ACTOR_ID = "ingest-agent";

export const AUDIT_ENTITIES = [
  "task",
  "stay",
  "room_sale",
  "room",
  "room_type",
  "shift",
  "checklist_item",
  "user",
  "handover",
  "breakfast",
  "form",
  "incident",
  "vehicle",
  "guest_request",
  "roster_week",
  "roster_day",
  "sale_extra",
  "sale_extra_type",
  "booking",
] as const;

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "open",
  "close",
  "status",
  "save",
  "done",
  "undo",
  "skip",
  "checkin",
  "checkout",
  "cancel",
  "no_show",
  "ingest",
  "accept",
  "lock",
  "unlock",
  "reset_password",
  "rename",
  "set_type",
  "rate",
  "clear",
] as const;

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  task: "Việc",
  stay: "Khách",
  room_sale: "Chỗ bán",
  room: "Phòng",
  room_type: "Hạng phòng",
  shift: "Ca",
  checklist_item: "Checklist",
  user: "Nhân viên",
  handover: "Bàn giao",
  breakfast: "Ăn sáng",
  form: "Biểu mẫu",
  incident: "Sự cố",
  vehicle: "Xe khách",
  guest_request: "Yêu cầu khách",
  roster_week: "Lịch tuần",
  roster_day: "Đổi ca ngày",
  sale_extra: "Dịch vụ booking",
  sale_extra_type: "Giá dịch vụ",
  booking: "Booking",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Thêm mới",
  update: "Sửa",
  delete: "Xóa",
  open: "Mở",
  close: "Đóng",
  status: "Đổi trạng thái",
  save: "Lưu",
  done: "Đánh dấu xong",
  undo: "Bỏ đánh dấu",
  skip: "Bỏ qua",
  checkin: "Nhận phòng",
  checkout: "Trả phòng",
  cancel: "Hủy",
  no_show: "No-show",
  ingest: "Đồng bộ PMS",
  accept: "Nhận",
  lock: "Khóa",
  unlock: "Mở khóa",
  reset_password: "Đặt lại mật khẩu",
  rename: "Đổi tên",
  set_type: "Đổi hạng",
  rate: "Sửa giá",
  clear: "Xóa lịch",
};

const FIELD_LABEL: Record<string, string> = {
  content: "Nội dung",
  status: "Trạng thái",
  guestName: "Khách",
  guestPhone: "Điện thoại",
  pmsCode: "Mã PMS",
  roomId: "Phòng",
  bookingId: "Booking",
  fullName: "Họ tên",
  username: "Tài khoản",
  role: "Vai trò",
  active: "Hoạt động",
  type: "Loại",
  name: "Tên",
  number: "Số phòng",
  hkStatus: "HK",
  opsStatus: "Ops",
  notes: "Ghi chú",
  note: "Ghi chú",
  reason: "Lý do",
  skipReason: "Bỏ qua",
  closeReason: "Lý do đóng",
  done: "Xong",
  rate: "Giá",
  baseRate: "Giá ngày thường",
  weekendRate: "Giá cuối tuần",
  checkIn: "Nhận",
  checkOut: "Trả",
  arrivalDate: "Đến",
  departureDate: "Đi",
  source: "Nguồn",
  origin: "Xuất xứ",
  adults: "NL",
  children: "TE",
  discountKind: "Chiết khấu",
  discountValue: "Mức CK",
  deposit: "Cọc",
  breakfast: "Ăn sáng",
  qty: "Số lượng",
  unitPrice: "Đơn giá",
  unit: "Đơn vị",
  formCode: "Mẫu",
  title: "Tiêu đề",
  label: "Mục",
  assignedTo: "Giao cho",
  priority: "Ưu tiên",
  dueAt: "Hạn",
  kind: "Loại",
  date: "Ngày",
  count: "Số dòng",
  effectiveFrom: "Áp dụng từ",
  reset: "Đặt lại MK",
};

const SKIP_FIELDS = new Set([
  "passwordHash",
  "photo",
  "id",
  "createdAt",
  "updatedAt",
  "updatedBy",
  "createdBy",
  "openedAt",
  "openedBy",
  "closedAt",
  "closedBy",
  "acceptedAt",
  "zaloMessage",
  "bookingId",
]);

export type AuditChange = {
  key: string;
  label: string;
  before: string;
  after: string;
  kind: "add" | "remove" | "change";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

const ENUM_LABEL: Record<string, Record<string, string>> = {
  source: SALE_SOURCE_LABEL,
  origin: SALE_ORIGIN_LABEL,
  status: SALE_STATUS_LABEL,
  discountKind: DISCOUNT_KIND_LABEL,
};

const MONEY_FIELDS = new Set(["deposit", "rate", "discountValue", "unitPrice"]);

export function formatAuditValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key && typeof value === "string" && ENUM_LABEL[key]?.[value]) return ENUM_LABEL[key][value];
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") {
    if (key && MONEY_FIELDS.has(key)) return `${value.toLocaleString("vi-VN")}₫`;
    return String(value);
  }
  if (typeof value === "string") {
    if (value.startsWith("data:image")) return "(ảnh)";
    if (value.length > 160) return `${value.slice(0, 157)}…`;
    return value;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return String(value);
  }
}

export function auditChanges(before: unknown, after: unknown): AuditChange[] {
  const prev = asRecord(before);
  const next = asRecord(after);
  if (!prev && !next) {
    if (before === after) return [];
    return [
      {
        key: "value",
        label: "Giá trị",
        before: formatAuditValue(before),
        after: formatAuditValue(after),
        kind: before == null ? "add" : after == null ? "remove" : "change",
      },
    ];
  }
  const prevKeys = Object.keys(prev ?? {});
  const nextKeys = Object.keys(next ?? {});
  const patchOnly = Boolean(prev && next && nextKeys.length > 0 && nextKeys.length < prevKeys.length);
  const keys = new Set(patchOnly ? nextKeys : [...prevKeys, ...nextKeys]);
  const rows: AuditChange[] = [];
  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue;
    const left = prev ? prev[key] : undefined;
    const right = next ? next[key] : undefined;
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    rows.push({
      key,
      label: FIELD_LABEL[key] || key,
      before: formatAuditValue(left, key),
      after: formatAuditValue(right, key),
      kind: left === undefined ? "add" : right === undefined ? "remove" : "change",
    });
  }
  return rows;
}

export function auditTarget(entity: string, before: unknown, after: unknown): string {
  const row = asRecord(after) || asRecord(before) || {};
  if (typeof row.content === "string" && row.content.trim()) return row.content.trim();
  if (typeof row.guestName === "string" && row.guestName.trim()) return row.guestName.trim();
  if (typeof row.fullName === "string" && row.fullName.trim()) return row.fullName.trim();
  if (typeof row.username === "string" && row.username.trim()) return row.username.trim();
  if (typeof row.number === "string" && row.number.trim()) return `P.${row.number}`;
  if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
  if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
  if (typeof row.pmsCode === "string" && row.pmsCode.trim()) return row.pmsCode.trim();
  if (typeof row.formCode === "string" && row.formCode.trim()) return row.formCode.trim();
  if (typeof row.title === "string" && row.title.trim()) return row.title.trim();
  if (entity === "shift" && typeof row.type === "string") return row.type;
  return "";
}

export function auditHref(entity: string, entityId: string, before: unknown, after: unknown): string | null {
  const row = asRecord(after) || asRecord(before) || {};
  switch (entity) {
    case "task":
      return `/tasks/${entityId}`;
    case "stay":
      return `/reception/${entityId}`;
    case "room_sale": {
      const bookingId = typeof row.bookingId === "string" && row.bookingId ? row.bookingId : entityId;
      return `/sales/bookings/${bookingId}`;
    }
    case "booking":
    case "sale_extra":
      return typeof row.bookingId === "string" && row.bookingId ? `/sales/bookings/${row.bookingId}` : `/sales/bookings/${entityId}`;
    case "room":
      return `/rooms/${entityId}`;
    case "room_type":
      return "/rooms/manage";
    case "shift":
    case "checklist_item":
      return typeof row.taskId === "string" && row.taskId ? `/tasks/${row.taskId}` : "/shifts";
    case "user":
      return `/staff/${entityId}`;
    case "handover":
      return `/handover/${entityId}`;
    case "breakfast":
      return "/kitchen";
    case "form":
      return typeof row.formCode === "string" && row.formCode ? `/forms/${row.formCode}/${entityId}` : "/forms";
    case "incident":
      return "/incidents";
    case "roster_week":
    case "roster_day":
      return "/roster";
    case "vehicle":
    case "guest_request":
      return typeof row.stayId === "string" && row.stayId ? `/reception/${row.stayId}` : "/reception";
    default:
      return null;
  }
}

export function auditActorName(actorId: string, fullName: string | null | undefined) {
  if (actorId === INGEST_ACTOR_ID) return "Agent PMS";
  return fullName?.trim() || actorId;
}

export function formatAuditWhen(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function actionTone(action: string): "ok" | "warn" | "danger" | "gold" | "teal" | "neutral" {
  if (action === "create" || action === "open" || action === "unlock" || action === "done" || action === "accept") return "ok";
  if (action === "delete" || action === "lock" || action === "cancel" || action === "close") return "danger";
  if (action === "ingest") return "gold";
  if (action === "update" || action === "save" || action === "status" || action === "rate" || action === "rename") return "teal";
  if (action === "skip" || action === "no_show" || action === "undo") return "warn";
  return "neutral";
}

export const BOOKING_LOG_ACTION_LABEL: Record<string, string> = {
  create: "Tạo",
  update: "Sửa",
  delete: "Xóa",
  checkin: "Nhận phòng",
  checkout: "Trả phòng",
  cancel: "Hủy",
  no_show: "No-show",
  ingest: "Đồng bộ PMS",
};

export type AuditLogView = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
};

export type BookingLogRow = AuditLogView & { changes: AuditChange[] };

export function collapseAuditBurst(rows: AuditLogView[]): BookingLogRow[] {
  const out: BookingLogRow[] = [];
  for (const row of rows) {
    const changes = auditChanges(row.before, row.after);
    const last = out[out.length - 1];
    const close =
      last &&
      last.actorId === row.actorId &&
      last.action === row.action &&
      last.entity === row.entity &&
      Math.abs(new Date(last.createdAt).getTime() - new Date(row.createdAt).getTime()) < 400;
    if (close) {
      const seen = new Set(last.changes.map((change) => `${change.key}|${change.before}|${change.after}`));
      for (const change of changes) {
        const stamp = `${change.key}|${change.before}|${change.after}`;
        if (!seen.has(stamp)) {
          last.changes.push(change);
          seen.add(stamp);
        }
      }
      continue;
    }
    out.push({ ...row, changes });
  }
  return out;
}
