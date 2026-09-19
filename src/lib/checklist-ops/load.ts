import { eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import * as t from "@/db/schema";
import { todayVN } from "../datetime";
import { isChecklistKind } from "../checklists";
import type { ChecklistBundle } from "./types";

export async function loadChecklistByTask(db: AppDb, taskId: string): Promise<ChecklistBundle | null> {
  const list = (await db.select().from(t.checklists).where(eq(t.checklists.taskId, taskId)).limit(1))[0];
  if (!list) return null;
  const items = (await db.select().from(t.checklistItems).where(eq(t.checklistItems.checklistId, list.id))).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  return { ...list, items };
}

export async function loadChecklistsForStay(db: AppDb, stayId: string): Promise<ChecklistBundle[]> {
  const lists = await db.select().from(t.checklists).where(eq(t.checklists.stayId, stayId));
  const items = await db.select().from(t.checklistItems);
  return lists
    .filter((row) => isChecklistKind(row.kind))
    .map((list) => ({
      ...list,
      items: items.filter((item) => item.checklistId === list.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => Number(a.kind === "checkout") - Number(b.kind === "checkout"));
}

export async function loadChecklistsForRoom(db: AppDb, roomId: string, date = todayVN()): Promise<ChecklistBundle[]> {
  const lists = (await db.select().from(t.checklists).where(eq(t.checklists.roomId, roomId))).filter(
    (row) => row.date === date && (row.kind === "checkin" || row.kind === "checkout"),
  );
  const items = await db.select().from(t.checklistItems);
  return lists.map((list) => ({
    ...list,
    items: items.filter((item) => item.checklistId === list.id).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function requiredPending(items: { required: boolean; done: boolean; skipReason: string | null }[]) {
  return items.filter((item) => item.required && !item.done && !item.skipReason);
}
