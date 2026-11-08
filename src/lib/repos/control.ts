import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import {
  CONTROL_PUSH_INTERVAL_MS,
  controlPushDue,
  findControlIssues,
  summarizeControlIssues,
  type ControlIssue,
} from "@/lib/control-issues";
import { nowISO, todayVN } from "@/lib/datetime";
import { schedulePush } from "@/lib/push";
import { audit } from "./audit";
import { listControlBookingCandidates, listPendingBookingChanges } from "./sales";

const CONTROL_LAST_PUSH_KEY = "control:last_push_at";
export { CONTROL_PUSH_INTERVAL_MS };

export async function loadCurrentControlIssues(now = new Date()) {
  const today = todayVN(now);
  const approvals = await listPendingBookingChanges();
  const bookings = await listControlBookingCandidates(today, approvals.map((row) => row.bookingId));
  return findControlIssues(bookings, approvals, now, today);
}

async function issueStateMap() {
  const db = await getDb();
  const rows = await db.select().from(t.controlIssueStates);
  return new Map(rows.map((row) => [row.fingerprint, row]));
}

function visibleIssues(issues: ControlIssue[], states: Awaited<ReturnType<typeof issueStateMap>>) {
  return issues.filter((issue) => {
    const state = states.get(issue.fingerprint);
    return !(issue.manualResolve && state?.resolvedBy && state.resolvedAt);
  });
}

export async function listControlIssues(now = new Date()) {
  const issues = await loadCurrentControlIssues(now);
  const states = await syncControlIssueStates(issues, now.toISOString());
  return visibleIssues(issues, states);
}

async function syncControlIssueStates(issues: ControlIssue[], at: string) {
  const db = await getDb();
  const states = await issueStateMap();
  const current = new Set(issues.map((issue) => issue.fingerprint));
  for (const state of states.values()) {
    if (current.has(state.fingerprint)) continue;
    if (!state.resolvedAt || state.resolvedBy) {
      await db
        .update(t.controlIssueStates)
        .set({ resolvedAt: at, resolvedBy: null, resolveNote: null })
        .where(eq(t.controlIssueStates.fingerprint, state.fingerprint));
      state.resolvedAt = at;
      state.resolvedBy = null;
      state.resolveNote = null;
    }
  }

  for (const issue of issues) {
    const prior = states.get(issue.fingerprint);
    if (!prior) {
      await db.insert(t.controlIssueStates).values({
        fingerprint: issue.fingerprint,
        kind: issue.kind,
        bookingId: issue.bookingId,
        firstSeenAt: at,
        lastSeenAt: at,
        resolvedAt: null,
        resolvedBy: null,
        resolveNote: null,
      });
      continue;
    }
    const keepManualResolution = issue.manualResolve && Boolean(prior.resolvedBy && prior.resolvedAt);
    await db
      .update(t.controlIssueStates)
      .set({
        kind: issue.kind,
        bookingId: issue.bookingId,
        lastSeenAt: at,
        ...(keepManualResolution ? {} : { resolvedAt: null, resolvedBy: null, resolveNote: null }),
      })
      .where(eq(t.controlIssueStates.fingerprint, issue.fingerprint));
  }

  return states;
}

export async function resolveControlIssue(fingerprint: string, note: string, actorId: string) {
  const cleanFingerprint = fingerprint.trim();
  const cleanNote = note.trim();
  if (!cleanFingerprint || cleanFingerprint.length > 300) throw new Error("Cảnh báo không hợp lệ");
  if (cleanNote.length < 3 || cleanNote.length > 500) throw new Error("Ghi chú xử lý cần từ 3 đến 500 ký tự");
  const issue = (await loadCurrentControlIssues()).find((row) => row.fingerprint === cleanFingerprint);
  if (!issue?.manualResolve) throw new Error("Cảnh báo này không thể đóng thủ công");

  const db = await getDb();
  const at = nowISO();
  await db
    .insert(t.controlIssueStates)
    .values({
      fingerprint: issue.fingerprint,
      kind: issue.kind,
      bookingId: issue.bookingId,
      firstSeenAt: at,
      lastSeenAt: at,
      resolvedAt: at,
      resolvedBy: actorId,
      resolveNote: cleanNote,
    })
    .onConflictDoUpdate({
      target: t.controlIssueStates.fingerprint,
      set: {
        kind: issue.kind,
        bookingId: issue.bookingId,
        lastSeenAt: at,
        resolvedAt: at,
        resolvedBy: actorId,
        resolveNote: cleanNote,
      },
    });
  await audit(actorId, "control_issue", issue.fingerprint, "resolve", undefined, {
    bookingId: issue.bookingId,
    kind: issue.kind,
    note: cleanNote,
  });
}

export async function runControlAuditPush(now = new Date()) {
  const at = now.toISOString();
  const issues = await loadCurrentControlIssues(now);
  const priorStates = await syncControlIssueStates(issues, at);
  const active = visibleIssues(issues, priorStates);
  if (!active.length) return { sent: false, count: 0 };

  const db = await getDb();
  const setting = (await db.select().from(t.appSettings).where(eq(t.appSettings.key, CONTROL_LAST_PUSH_KEY)).limit(1))[0];
  if (!controlPushDue(setting?.value, now)) {
    return { sent: false, count: active.length };
  }

  await schedulePush({
    role: "manager",
    title: `Còn ${active.length} cảnh báo chưa xử lý`,
    body: summarizeControlIssues(active),
    link: "/control",
  });
  await db
    .insert(t.appSettings)
    .values({ key: CONTROL_LAST_PUSH_KEY, value: at, updatedAt: at, updatedBy: null })
    .onConflictDoUpdate({
      target: t.appSettings.key,
      set: { value: at, updatedAt: at, updatedBy: null },
    });
  return { sent: true, count: active.length };
}
