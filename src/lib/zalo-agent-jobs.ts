import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, zaloAgentJobs } from "@/db/schema";
import { nid, nowISO } from "@/lib/datetime";
import { outboxStatusAfterFailure } from "@/lib/zalo-outbox";

const STALE_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BATCH = 3;
const AGENT_SEEN = "zalo_agent_seen_at";

export type ZaloAgentJobKind = "login_qr" | "list_groups";
export type ZaloAgentEvent = { status: string; image?: string; name?: string; message?: string };
export type ZaloGroupOption = { id: string; name: string; members: number };

export async function enqueueZaloAgentJob(actorId: string, kind: ZaloAgentJobKind, payload: Record<string, unknown> = {}) {
  const db = await getDb();
  if (kind === "login_qr") {
    await db
      .update(zaloAgentJobs)
      .set({ status: "failed", error: "Đã thay bằng lệnh kết nối mới.", finishedAt: nowISO(), claimId: null, claimedAt: null })
      .where(and(eq(zaloAgentJobs.kind, "login_qr"), inArray(zaloAgentJobs.status, ["pending", "running"])));
  }
  const id = nid();
  await db.insert(zaloAgentJobs).values({
    id,
    kind,
    actorId,
    payload: JSON.stringify(payload),
    status: "pending",
    events: "[]",
    attempts: 0,
    createdAt: nowISO(),
  });
  return id;
}

export async function loadZaloAgentJob(id: string) {
  const db = await getDb();
  return (await db.select().from(zaloAgentJobs).where(eq(zaloAgentJobs.id, id)).limit(1))[0] || null;
}

export function parseJobEvents(raw: string | null | undefined): ZaloAgentEvent[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as ZaloAgentEvent[]) : [];
  } catch {
    return [];
  }
}

export function parseJobPayload(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function parseGroupList(raw: string | null | undefined): ZaloGroupOption[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { groups?: ZaloGroupOption[] };
    if (!Array.isArray(data.groups)) return [];
    return data.groups
      .filter((group) => group && typeof group.id === "string" && typeof group.name === "string")
      .map((group) => ({
        id: String(group.id),
        name: String(group.name || "Nhóm không tên"),
        members: Number(group.members || 0),
      }));
  } catch {
    return [];
  }
}

export async function waitZaloAgentJob<T>(
  id: string,
  read: (row: typeof zaloAgentJobs.$inferSelect) => T | null,
  timeoutMs = 90_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await loadZaloAgentJob(id);
    if (!row) throw new Error("Lệnh Zalo không còn trên hàng đợi.");
    if (row.status === "failed") throw new Error(row.error || "Máy local không xử lý được lệnh Zalo.");
    if (row.status === "done") {
      const value = read(row);
      if (value == null) throw new Error("Máy local không trả kết quả Zalo.");
      return value;
    }
    await sleep(500);
  }
  throw new Error("Máy local chưa nhận lệnh. Hãy chạy agent Zalo trên Mac rồi thử lại.");
}

export async function claimZaloAgentJobs() {
  const db = await getDb();
  const now = nowISO();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const claimId = nid();
  const rows = await db
    .select()
    .from(zaloAgentJobs)
    .where(
      or(
        eq(zaloAgentJobs.status, "pending"),
        and(eq(zaloAgentJobs.status, "running"), lt(zaloAgentJobs.claimedAt, staleBefore)),
      ),
    )
    .orderBy(asc(zaloAgentJobs.createdAt))
    .limit(BATCH);
  const jobs = [];
  for (const row of rows) {
    await db
      .update(zaloAgentJobs)
      .set({ status: "running", claimId, claimedAt: now })
      .where(
        and(
          eq(zaloAgentJobs.id, row.id),
          or(
            eq(zaloAgentJobs.status, "pending"),
            and(eq(zaloAgentJobs.status, "running"), lt(zaloAgentJobs.claimedAt, staleBefore)),
          ),
        ),
      );
    const claimed = (
      await db.select().from(zaloAgentJobs).where(and(eq(zaloAgentJobs.id, row.id), eq(zaloAgentJobs.claimId, claimId))).limit(1)
    )[0];
    if (claimed) {
      jobs.push({
        id: claimed.id,
        claimId,
        kind: claimed.kind as ZaloAgentJobKind,
        payload: parseJobPayload(claimed.payload),
      });
    }
  }
  return jobs;
}

export async function appendZaloAgentEvent(id: string, claimId: string, event: ZaloAgentEvent) {
  const db = await getDb();
  const row = (await db.select().from(zaloAgentJobs).where(eq(zaloAgentJobs.id, id)).limit(1))[0];
  if (!row || row.claimId !== claimId || row.status !== "running") return false;
  const events = [...parseJobEvents(row.events), event].slice(-40);
  await db
    .update(zaloAgentJobs)
    .set({ events: JSON.stringify(events) })
    .where(and(eq(zaloAgentJobs.id, id), eq(zaloAgentJobs.claimId, claimId)));
  return true;
}

export async function finishZaloAgentJob(id: string, claimId: string, ok: boolean, result: unknown = null, error = "") {
  const db = await getDb();
  const row = (await db.select().from(zaloAgentJobs).where(eq(zaloAgentJobs.id, id)).limit(1))[0];
  if (!row || row.claimId !== claimId || row.status !== "running") return false;
  if (ok) {
    await db
      .update(zaloAgentJobs)
      .set({
        status: "done",
        result: result == null ? null : JSON.stringify(result),
        error: null,
        finishedAt: nowISO(),
      })
      .where(and(eq(zaloAgentJobs.id, id), eq(zaloAgentJobs.claimId, claimId)));
    return true;
  }
  const attempts = row.attempts + 1;
  const status = outboxStatusAfterFailure(row.attempts);
  await db
    .update(zaloAgentJobs)
    .set({
      status: status === "pending" ? "pending" : "failed",
      attempts,
      error: error.slice(0, 300),
      claimId: null,
      claimedAt: null,
      finishedAt: status === "pending" ? null : nowISO(),
    })
    .where(and(eq(zaloAgentJobs.id, id), eq(zaloAgentJobs.claimId, claimId)));
  return true;
}

export async function touchZaloAgentSeen() {
  const db = await getDb();
  const at = nowISO();
  await db
    .insert(appSettings)
    .values({ key: AGENT_SEEN, value: at, updatedAt: at, updatedBy: "zalo-agent" })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: at, updatedAt: at, updatedBy: "zalo-agent" },
    });
}

export async function loadZaloAgentSeen() {
  const db = await getDb();
  const row = (await db.select().from(appSettings).where(eq(appSettings.key, AGENT_SEEN)).limit(1))[0];
  return row?.value || "";
}

export function agentSeenFresh(seenAt: string, withinMs = 20_000) {
  if (!seenAt) return false;
  const ts = Date.parse(seenAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= withinMs;
}

export async function agentJobCounts() {
  const db = await getDb();
  const rows = await db
    .select({ status: zaloAgentJobs.status, count: sql<number>`count(*)` })
    .from(zaloAgentJobs)
    .groupBy(zaloAgentJobs.status);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.count || 0);
  return { pending: count("pending") + count("running"), failed: count("failed") };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
