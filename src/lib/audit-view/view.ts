import { TZ } from "../datetime";
import { INGEST_ACTOR_ID } from "./labels";
import { asRecord, auditChanges, type AuditChange } from "./diff";

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
