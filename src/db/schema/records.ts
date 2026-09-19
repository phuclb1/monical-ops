import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const formSubmissions = sqliteTable("form_submissions", {
  id: text("id").primaryKey(),
  formCode: text("form_code").notNull(),
  shiftId: text("shift_id"),
  roomId: text("room_id"),
  stayId: text("stay_id"),
  date: text("date").notNull(),
  payload: text("payload").notNull(),
  signature: text("signature"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  location: text("location"),
  roomId: text("room_id"),
  description: text("description").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  photo: text("photo"),
  reportedBy: text("reported_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const breakfasts = sqliteTable("breakfasts", {
  id: text("id").primaryKey(),
  date: text("date").notNull().unique(),
  adults: integer("adults").notNull().default(0),
  children: integer("children").notNull().default(0),
  vegetarian: integer("vegetarian").notNull().default(0),
  allergy: integer("allergy").notNull().default(0),
  early: integer("early").notNull().default(0),
  takeaway: integer("takeaway").notNull().default(0),
  notes: text("notes"),
  sentBy: text("sent_by"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  actualAdults: integer("actual_adults"),
  actualChildren: integer("actual_children"),
  updatedAt: text("updated_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  role: text("role"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
