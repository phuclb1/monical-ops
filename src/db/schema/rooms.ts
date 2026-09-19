import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roomTypes = sqliteTable("room_types", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  baseRate: integer("base_rate").notNull().default(0),
  weekendRate: integer("weekend_rate").notNull().default(0),
  adults: integer("adults").notNull().default(2),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  floor: integer("floor").notNull(),
  type: text("type").notNull(),
  opsStatus: text("ops_status").notNull(),
  hkStatus: text("hk_status").notNull(),
  assignedTo: text("assigned_to"),
  oooReason: text("ooo_reason"),
  oooApproved: integer("ooo_approved", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});
