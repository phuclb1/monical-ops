import { DISCOUNT_KIND_LABEL, SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "../constants";
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
  status: SALE_STATUS_LABEL,
  discountKind: DISCOUNT_KIND_LABEL,
};

const MONEY_FIELDS = new Set(["deposit", "cashPaid", "transferPaid", "companyPaid", "rate", "discountValue", "unitPrice"]);

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
