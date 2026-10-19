import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/db";
import * as t from "@/db/schema";
import { todayVN } from "../datetime";
import { isChecklistKind } from "../checklists";
import { mapInChunks } from "../repos/chunk";
import type { ChecklistBundle } from "./types";

async function itemsForLists(db: AppDb, lists: (typeof t.checklists.$inferSelect)[]) {
  const items = await mapInChunks(lists.map((list) => list.id), (chunk) =>
    db.select().from(t.checklistItems).where(inArray(t.checklistItems.checklistId, chunk)),
  );
  const byList = new Map<string, (typeof items)[number][]>();
  for (const item of items) {
    const list = byList.get(item.checklistId) || [];
    list.push(item);
    byList.set(item.checklistId, list);
  }
  return lists.map((list) => ({
    ...list,
    items: (byList.get(list.id) || []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export async function loadChecklistByTask(db: AppDb, taskId: string): Promise<ChecklistBundle | null> {
  const list = (await db.select().from(t.checklists).where(eq(t.checklists.taskId, taskId)).limit(1))[0];
  if (!list) return null;
  return (await itemsForLists(db, [list]))[0];
}

export async function loadChecklistsForStay(db: AppDb, stayId: string): Promise<ChecklistBundle[]> {
  const lists = (await db.select().from(t.checklists).where(eq(t.checklists.stayId, stayId))).filter((row) =>
    isChecklistKind(row.kind),
  );
  return (await itemsForLists(db, lists)).sort((a, b) => Number(a.kind === "checkout") - Number(b.kind === "checkout"));
}

export async function loadChecklistsForRoom(db: AppDb, roomId: string, date = todayVN()): Promise<ChecklistBundle[]> {
  const lists = await db
    .select()
    .from(t.checklists)
    .where(and(eq(t.checklists.roomId, roomId), eq(t.checklists.date, date), inArray(t.checklists.kind, ["checkin", "checkout"])));
  return itemsForLists(db, lists);
}

export function requiredPending(items: { required: boolean; done: boolean; skipReason: string | null }[]) {
  return items.filter((item) => item.required && !item.done && !item.skipReason);
}
