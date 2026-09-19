import * as t from "@/db/schema";

export type ChecklistActor = { actorId: string; assigneeId?: string | null };
type ChecklistRow = typeof t.checklists.$inferSelect;
type ItemRow = typeof t.checklistItems.$inferSelect;
export type ChecklistBundle = ChecklistRow & { items: ItemRow[] };
