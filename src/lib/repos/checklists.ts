import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO } from "../datetime";
import { requiredPending } from "../checklist-ops";
import type { SessionUser } from "../types";
import { audit } from "./audit";
import { updateTaskStatus } from "./tasks";

export async function toggleChecklistItem(user: SessionUser, itemId: string, skipReason?: string) {
  const db = await getDb();
  const item = (await db.select().from(t.checklistItems).where(eq(t.checklistItems.id, itemId)))[0];
  if (!item) throw new Error("Không tìm thấy mục");
  const done = !item.done;
  await db
    .update(t.checklistItems)
    .set({
      done,
      doneBy: done ? user.id : null,
      doneAt: done ? nowISO() : null,
      skipReason: skipReason || item.skipReason,
    })
    .where(eq(t.checklistItems.id, itemId));
  await audit(user.id, "checklist_item", itemId, done ? "done" : "undo", item, { done, skipReason });
  await syncChecklistTask(user, item.checklistId);
}

export async function skipChecklistItem(user: SessionUser, itemId: string, reason: string) {
  const db = await getDb();
  const item = (await db.select().from(t.checklistItems).where(eq(t.checklistItems.id, itemId)))[0];
  if (!item) throw new Error("Không tìm thấy mục");
  await db
    .update(t.checklistItems)
    .set({ skipReason: reason, done: true, doneBy: user.id, doneAt: nowISO() })
    .where(eq(t.checklistItems.id, itemId));
  await audit(user.id, "checklist_item", itemId, "skip", null, { reason });
  await syncChecklistTask(user, item.checklistId);
}

export async function saveChecklistItem(
  user: SessionUser,
  itemId: string,
  patch: { note?: string; photo?: string; skipReason?: string },
) {
  const db = await getDb();
  const item = (await db.select().from(t.checklistItems).where(eq(t.checklistItems.id, itemId)))[0];
  if (!item) throw new Error("Không tìm thấy mục");
  const skipReason = patch.skipReason !== undefined ? patch.skipReason || null : item.skipReason;
  const skipped = Boolean(skipReason);
  await db
    .update(t.checklistItems)
    .set({
      note: patch.note !== undefined ? patch.note || null : item.note,
      photo: patch.photo !== undefined ? patch.photo || null : item.photo,
      skipReason,
      done: skipped ? true : item.done,
      doneBy: skipped ? user.id : item.doneBy,
      doneAt: skipped ? nowISO() : item.doneAt,
    })
    .where(eq(t.checklistItems.id, itemId));
  await audit(user.id, "checklist_item", itemId, "save", item, patch);
  await syncChecklistTask(user, item.checklistId);
}

async function syncChecklistTask(user: SessionUser, checklistId: string) {
  const db = await getDb();
  const list = (await db.select().from(t.checklists).where(eq(t.checklists.id, checklistId)))[0];
  if (!list?.taskId) return;
  const items = await db.select().from(t.checklistItems).where(eq(t.checklistItems.checklistId, checklistId));
  const pending = requiredPending(items);
  const task = (await db.select().from(t.tasks).where(eq(t.tasks.id, list.taskId)))[0];
  if (!task) return;
  if (!pending.length && ["new", "accepted", "in_progress", "blocked"].includes(task.status)) {
    await updateTaskStatus(user, task.id, "done", "Checklist xong");
  }
  if (pending.length && task.status === "done") {
    await updateTaskStatus(user, task.id, "in_progress", "Còn mục checklist");
  }
}

export function unfinishedRequired(items: { required: boolean; done: boolean; skipReason: string | null }[]) {
  return requiredPending(items);
}
