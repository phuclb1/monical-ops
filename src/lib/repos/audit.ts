import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "../datetime";

export async function audit(actorId: string, entity: string, entityId: string, action: string, before?: unknown, after?: unknown) {
  const db = await getDb();
  await db.insert(t.auditLogs).values({
    id: nid(),
    entity,
    entityId,
    action,
    actorId,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    createdAt: nowISO(),
  });
}

export function parseAuditJson(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function listAuditLogs(filter?: { entity?: string; action?: string; actorId?: string; before?: string; limit?: number }) {
  const db = await getDb();
  const limit = Math.min(Math.max(filter?.limit ?? 60, 1), 120);
  const clauses = [];
  if (filter?.entity) clauses.push(eq(t.auditLogs.entity, filter.entity));
  if (filter?.action) clauses.push(eq(t.auditLogs.action, filter.action));
  if (filter?.actorId) clauses.push(eq(t.auditLogs.actorId, filter.actorId));
  if (filter?.before) clauses.push(lt(t.auditLogs.createdAt, filter.before));
  const rows = await db
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
      actorUsername: t.users.username,
    })
    .from(t.auditLogs)
    .leftJoin(t.users, eq(t.auditLogs.actorId, t.users.id))
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(desc(t.auditLogs.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    rows: page.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      actorId: row.actorId,
      actorName: row.actorName,
      actorUsername: row.actorUsername,
      createdAt: row.createdAt,
      before: parseAuditJson(row.beforeJson),
      after: parseAuditJson(row.afterJson),
    })),
    nextBefore: hasMore ? page[page.length - 1]?.createdAt ?? null : null,
  };
}
