import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const receptionWeekSlots = sqliteTable("reception_week_slots", {
  id: text("id").primaryKey(),
  weekday: integer("weekday").notNull(),
  shiftType: text("shift_type").notNull(),
  userId: text("user_id").notNull(),
  effectiveFrom: text("effective_from").notNull().default("1970-01-01"),
});

export const receptionDayOverrides = sqliteTable("reception_day_overrides", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  shiftType: text("shift_type").notNull(),
  userId: text("user_id").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  openedAt: text("opened_at").notNull(),
  openedBy: text("opened_by").notNull(),
  closedAt: text("closed_at"),
  closedBy: text("closed_by"),
  closeReason: text("close_reason"),
});

export const checklists = sqliteTable("checklists", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("shift_open"),
  shiftId: text("shift_id"),
  stayId: text("stay_id"),
  roomId: text("room_id"),
  taskId: text("task_id"),
  date: text("date"),
  departmentCode: text("department_code").notNull().default("reception"),
  title: text("title").notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  checklistId: text("checklist_id").notNull(),
  itemKey: text("item_key"),
  label: text("label").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  doneBy: text("done_by"),
  doneAt: text("done_at"),
  skipReason: text("skip_reason"),
  note: text("note"),
  photo: text("photo"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("general"),
  stayId: text("stay_id"),
  fromDept: text("from_dept").notNull(),
  toDept: text("to_dept").notNull(),
  roomId: text("room_id"),
  area: text("area"),
  content: text("content").notNull(),
  priority: text("priority").notNull(),
  assigneeId: text("assignee_id"),
  dueAt: text("due_at"),
  formCode: text("form_code"),
  status: text("status").notNull(),
  blockedReason: text("blocked_reason"),
  blockedAction: text("blocked_action"),
  zaloMessage: text("zalo_message"),
  zaloSent: integer("zalo_sent", { mode: "boolean" }).notNull().default(false),
  zaloSentAt: text("zalo_sent_at"),
  photo: text("photo"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const taskHistory = sqliteTable("task_history", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorId: text("actor_id").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});

export const guestRequests = sqliteTable("guest_requests", {
  id: text("id").primaryKey(),
  stayId: text("stay_id"),
  roomId: text("room_id"),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  quantity: integer("quantity").notNull().default(1),
  dueAt: text("due_at"),
  assigneeId: text("assignee_id"),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const handovers = sqliteTable("handovers", {
  id: text("id").primaryKey(),
  fromShiftId: text("from_shift_id").notNull(),
  toShiftType: text("to_shift_type"),
  status: text("status").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  acceptedBy: text("accepted_by"),
  acceptedAt: text("accepted_at"),
  notes: text("notes"),
});

export const handoverItems = sqliteTable("handover_items", {
  id: text("id").primaryKey(),
  handoverId: text("handover_id").notNull(),
  category: text("category").notNull(),
  refType: text("ref_type"),
  refId: text("ref_id"),
  summary: text("summary").notNull(),
  note: text("note"),
});
