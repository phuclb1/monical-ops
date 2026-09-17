import { Chip } from "@/components/ui";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  BOOKING_LOG_ACTION_LABEL,
  actionTone,
  auditActorName,
  formatAuditWhen,
  type BookingLogRow,
} from "@/lib/audit-view";

function roomLabel(value: string, rooms: Record<string, string>) {
  const number = rooms[value];
  return number ? `P.${number}` : value;
}

function formatChangeValue(key: string, value: string, rooms: Record<string, string>) {
  if (key === "roomId") return roomLabel(value, rooms);
  return value;
}

export function BookingLog({
  rows,
  rooms = {},
}: {
  rows: BookingLogRow[];
  rooms?: Record<string, string>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-[#5c6665]">Chưa có nhật ký trên booking này.</p>;
  }
  return (
    <ol className="booking-log">
      {rows.map((row) => {
        const who = auditActorName(row.actorId, row.actorName);
        const verb = BOOKING_LOG_ACTION_LABEL[row.action] || AUDIT_ACTION_LABEL[row.action] || row.action;
        const kind = row.entity === "room_sale" || row.entity === "booking" ? "" : AUDIT_ENTITY_LABEL[row.entity] || row.entity;
        const showChanges = row.action !== "create" && row.changes.length > 0;
        return (
          <li key={row.id} className="booking-log-item">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{who}</p>
                <p className="text-xs text-[#5c6665]">{formatAuditWhen(row.createdAt)}</p>
              </div>
              <Chip tone={actionTone(row.action)}>{verb}</Chip>
            </div>
            {kind ? <p className="mt-1 text-xs text-[#5c6665]">{kind}</p> : null}
            {showChanges ? (
              <ul className="mt-2 space-y-1 text-sm">
                {row.changes.map((change) => (
                  <li key={`${change.key}-${change.before}-${change.after}`}>
                    <span className="text-[#5c6665]">{change.label}: </span>
                    {change.kind === "add" ? (
                      <b>{formatChangeValue(change.key, change.after, rooms)}</b>
                    ) : change.kind === "remove" ? (
                      <span>
                        xóa <b>{formatChangeValue(change.key, change.before, rooms)}</b>
                      </span>
                    ) : (
                      <span>
                        <span className="text-[#8a7a72] line-through">{formatChangeValue(change.key, change.before, rooms)}</span>
                        {" → "}
                        <b>{formatChangeValue(change.key, change.after, rooms)}</b>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
