import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { collapseAuditBurst } from "../../audit-view";
import { parseAuditJson } from "../audit";
import { listUsers } from "../users";
import { getBooking } from "./queries";

export async function listBookingLogs(bookingId: string) {
  const booking = await getBooking(bookingId);
  if (!booking) return [];
  const ids = [...new Set([booking.id, ...booking.rooms.map((row) => row.id), ...booking.extras.map((row) => row.id)])];
  const db = await getDb();
  const rows = ids.length
    ? await db
        .select({
          id: t.auditLogs.id,
          entity: t.auditLogs.entity,
          entityId: t.auditLogs.entityId,
          action: t.auditLogs.action,
          actorId: t.auditLogs.actorId,
          beforeJson: t.auditLogs.beforeJson,
          afterJson: t.auditLogs.afterJson,
          createdAt: t.auditLogs.createdAt,
          actorName: t.users.fullName,
        })
        .from(t.auditLogs)
        .leftJoin(t.users, eq(t.auditLogs.actorId, t.users.id))
        .where(inArray(t.auditLogs.entityId, ids))
        .orderBy(desc(t.auditLogs.createdAt))
        .limit(80)
    : [];
  const mapped = rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    actorId: row.actorId,
    actorName: row.actorName,
    createdAt: row.createdAt,
    before: parseAuditJson(row.beforeJson),
    after: parseAuditJson(row.afterJson),
  }));
  const hasCreate = mapped.some((row) => row.action === "create");
  if (!hasCreate) {
    const first = [...booking.rooms].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (first?.createdBy) {
      const creator = (await listUsers()).find((person) => person.id === first.createdBy);
      mapped.push({
        id: `created-${booking.id}`,
        entity: "room_sale",
        entityId: first.id,
        action: "create",
        actorId: first.createdBy,
        actorName: creator?.fullName || null,
        createdAt: first.createdAt,
        before: null,
        after: {
          guestName: first.guestName,
          guestPhone: first.guestPhone,
          source: first.source,
          adults: first.adults,
          children: first.children,
          bookingId: booking.id,
        },
      });
      mapped.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    }
  }
  return collapseAuditBurst(mapped);
}
