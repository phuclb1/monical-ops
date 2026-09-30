import {
  DEPT_LABEL,
  DISCOUNT_KIND_LABEL,
  HK_LABEL,
  PAYMENT_METHOD_LABEL,
  PRIORITY_LABEL,
  REQUEST_KIND_LABEL,
  ROLE_LABEL,
  SALE_ORIGIN_LABEL,
  SALE_SOURCE_LABEL,
  SALE_STATUS_LABEL,
  SHIFT_LABEL,
  STAY_LABEL,
  TASK_STATUS_LABEL,
} from "../constants";
import { TZ } from "../datetime";
import { FIELD_LABEL, SKIP_FIELDS } from "./labels";

export type AuditChange = {
  key: string;
  label: string;
  before: string;
  after: string;
  kind: "add" | "remove" | "change";
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

const ENUM_LABEL: Record<string, Record<string, string>> = {
  source: SALE_SOURCE_LABEL,
  origin: SALE_ORIGIN_LABEL,
  status: {
    ...SALE_STATUS_LABEL,
    ...STAY_LABEL,
    ...TASK_STATUS_LABEL,
    open: "Đang mở",
    closed: "Đã đóng",
  },
  discountKind: DISCOUNT_KIND_LABEL,
  role: ROLE_LABEL,
  departmentCode: DEPT_LABEL,
  type: SHIFT_LABEL,
  priority: PRIORITY_LABEL,
  hkStatus: HK_LABEL,
  opsStatus: {
    vacant_clean: "Phòng trống sạch",
    vacant_dirty: "Phòng trống bẩn",
    occupied: "Có khách",
    cleaning: "Đang dọn",
    waiting_inspect: "Chờ kiểm phòng",
    ins: "Đã kiểm phòng",
    ooo: "Ngưng sử dụng",
  },
  otaCommissionKind: {
    percent: "%",
    amount: "Số tiền",
  },
  otaPaymentMode: {
    debt: "OTA đã thu khách",
    hotel: "Khách thanh toán tại khách sạn",
  },
  paymentMethod: PAYMENT_METHOD_LABEL,
  unit: {
    night: "Theo đêm",
    once: "Một lần",
    kg: "Kilôgam",
  },
  kind: {
    ...REQUEST_KIND_LABEL,
    catalog: "Theo danh mục",
    custom: "Tùy chỉnh",
  },
};

const MONEY_FIELDS = new Set([
  "deposit",
  "checkinPaid",
  "cashPaid",
  "transferPaid",
  "companyPaid",
  "rate",
  "discountValue",
  "unitPrice",
  "amount",
  "subtotal",
  "total",
  "due",
]);
const DATE_FIELDS = new Set(["checkIn", "checkOut", "arrivalDate", "departureDate", "date", "effectiveFrom"]);
const DATE_TIME_FIELDS = new Set(["dueAt"]);

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatAuditValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key && typeof value === "string" && ENUM_LABEL[key]?.[value]) return ENUM_LABEL[key][value];
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") {
    if (key === "otaCommissionPercent") return `${value}%`;
    if (key && MONEY_FIELDS.has(key)) return `${value.toLocaleString("vi-VN")}₫`;
    return String(value);
  }
  if (typeof value === "string") {
    if (key && DATE_FIELDS.has(key)) return formatDateOnly(value);
    if (key && DATE_TIME_FIELDS.has(key) && !Number.isNaN(Date.parse(value))) {
      return new Intl.DateTimeFormat("vi-VN", {
        timeZone: TZ,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    }
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

function formatChangeValue(value: unknown, key: string, row: Record<string, unknown> | null) {
  if (key === "otaCommissionValue" && typeof value === "number") {
    if (row?.otaCommissionKind === "amount") return formatAuditValue(value, "deposit");
    return `${value}%`;
  }
  if (key === "otaCommissionPercent" && typeof value === "number") return `${value}%`;
  if (key === "discountValue" && typeof value === "number") {
    if (row?.discountKind === "percent") return `${value}%`;
    if (row?.discountKind === "none") return "—";
  }
  return formatAuditValue(value, key);
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
      before: formatChangeValue(left, key, prev),
      after: formatChangeValue(right, key, next),
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
