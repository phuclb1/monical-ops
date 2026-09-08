import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  departmentId: text("department_id").notNull(),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
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

export const stays = sqliteTable("stays", {
  id: text("id").primaryKey(),
  pmsCode: text("pms_code").notNull(),
  roomId: text("room_id"),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone"),
  status: text("status").notNull(),
  arrivalDate: text("arrival_date").notNull(),
  departureDate: text("departure_date").notNull(),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  breakfast: integer("breakfast", { mode: "boolean" }).notNull().default(true),
  pmsBookingOk: integer("pms_booking_ok", { mode: "boolean" }).notNull().default(false),
  pmsCheckinOk: integer("pms_checkin_ok", { mode: "boolean" }).notNull().default(false),
  pmsCheckoutOk: integer("pms_checkout_ok", { mode: "boolean" }).notNull().default(false),
  invoiceOk: integer("invoice_ok", { mode: "boolean" }).notNull().default(false),
  paymentNote: text("payment_note"),
  checkinAt: text("checkin_at"),
  registrationDueAt: text("registration_due_at"),
  registrationDoneAt: text("registration_done_at"),
  registrationReason: text("registration_reason"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(),
  stayId: text("stay_id").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  plate: text("plate").notNull(),
  location: text("location"),
  keyLocation: text("key_location"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
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
  shiftId: text("shift_id").notNull(),
  departmentCode: text("department_code").notNull(),
  title: text("title").notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: text("id").primaryKey(),
  checklistId: text("checklist_id").notNull(),
  label: text("label").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  doneBy: text("done_by"),
  doneAt: text("done_at"),
  skipReason: text("skip_reason"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
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
