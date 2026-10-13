import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { zaloOutbox } from "@/db/schema";
import { nid, nowISO } from "@/lib/datetime";
import { loadZaloCredentials, saveZaloCookies, type ZaloCredentials } from "@/lib/zalo-session";

const STALE_MS = 3 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BATCH = 5;

export function tokenMatches(expected: string, provided: string) {
  if (!expected || !provided) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

export function outboxStatusAfterFailure(attempts: number) {
  return attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
}

export async function enqueueZaloOutbox(actorId: string, groupId: string, body: string) {
  const db = await getDb();
  const id = nid();
  await db.insert(zaloOutbox).values({
    id,
    actorId,
    groupId,
    body,
    status: "pending",
    attempts: 0,
    createdAt: nowISO(),
  });
  return id;
}

export async function zaloOutboxCounts() {
  const db = await getDb();
  const rows = await db
    .select({ status: zaloOutbox.status, count: sql<number>`count(*)` })
    .from(zaloOutbox)
    .groupBy(zaloOutbox.status);
  const count = (status: string) => Number(rows.find((row) => row.status === status)?.count || 0);
  return { pending: count("pending") + count("sending"), failed: count("failed") };
}

export async function claimZaloOutbox() {
  const db = await getDb();
  const now = nowISO();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const claimId = nid();
  const rows = await db
    .select()
    .from(zaloOutbox)
    .where(
      or(
        eq(zaloOutbox.status, "pending"),
        and(eq(zaloOutbox.status, "sending"), lt(zaloOutbox.claimedAt, staleBefore)),
      ),
    )
    .orderBy(asc(zaloOutbox.createdAt))
    .limit(BATCH);
  const jobs = [];
  for (const row of rows) {
    await db
      .update(zaloOutbox)
      .set({ status: "sending", claimId, claimedAt: now })
      .where(
        and(
          eq(zaloOutbox.id, row.id),
          or(
            eq(zaloOutbox.status, "pending"),
            and(eq(zaloOutbox.status, "sending"), lt(zaloOutbox.claimedAt, staleBefore)),
          ),
        ),
      );
    const claimed = (
      await db.select().from(zaloOutbox).where(and(eq(zaloOutbox.id, row.id), eq(zaloOutbox.claimId, claimId))).limit(1)
    )[0];
    if (claimed) jobs.push({ id: claimed.id, claimId, groupId: claimed.groupId, message: claimed.body });
  }
  return jobs;
}

export async function finishZaloOutbox(id: string, claimId: string, ok: boolean, error = "") {
  const db = await getDb();
  const row = (await db.select().from(zaloOutbox).where(eq(zaloOutbox.id, id)).limit(1))[0];
  if (!row || row.claimId !== claimId || row.status !== "sending") return false;
  if (ok) {
    await db
      .update(zaloOutbox)
      .set({ status: "sent", error: null, sentAt: nowISO() })
      .where(and(eq(zaloOutbox.id, id), eq(zaloOutbox.claimId, claimId)));
    return true;
  }
  const attempts = row.attempts + 1;
  await db
    .update(zaloOutbox)
    .set({
      status: outboxStatusAfterFailure(row.attempts),
      attempts,
      error: error.slice(0, 300),
      claimId: null,
      claimedAt: null,
    })
    .where(and(eq(zaloOutbox.id, id), eq(zaloOutbox.claimId, claimId)));
  return true;
}

export function parseAgentCredentials(value: unknown): ZaloCredentials | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<ZaloCredentials>;
  if (!data.imei || !data.userAgent || !Array.isArray(data.cookies) || data.cookies.length === 0) return null;
  return {
    imei: String(data.imei),
    userAgent: String(data.userAgent),
    language: data.language || "vi",
    cookies: data.cookies,
  };
}

export async function agentCredentials() {
  const stored = await loadZaloCredentials();
  return stored?.credentials || null;
}

export async function rememberAgentCredentials(credentials: ZaloCredentials) {
  await saveZaloCookies("zalo-agent", credentials);
}
