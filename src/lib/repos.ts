import { and, desc, eq, like, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import * as t from "./db/schema";
import { addDaysVN, addMinutes, currentShiftType, nid, nextDate, nextShiftSlot, nowISO, shiftWindow, todayVN, weekdayISO } from "./datetime";
import { isActiveSaleStatus, isOpsBookingCode, isSaleOrigin, isSaleSource, nightlyNet, normalizeDiscount, occupiesNight, parseSaleSource, rangesOverlap, saleQuote, saleStatusToStay } from "./sales";
import { can } from "./permissions";
import { dayOverrideId, rosterVersionOf, weekSlotId } from "./roster";
import { ensureShiftChecklists, ensureTodayRoomTasks, loadChecklistByTask, loadChecklistsForRoom, loadChecklistsForStay, requiredPending } from "./checklist-ops";
import { getTaskType, taskBoardColumn, taskTypeLabel, type TaskBoardColumn } from "./task-types";
import type { DepartmentCode, HkStatus, Role, SaleSource, SaleStatus, SessionUser, ShiftType, TaskStatus } from "./types";
import { DEPT_LABEL, HK_LABEL, ROLE_DEPT, TASK_STATUS_LABEL, requestKindLabel } from "./constants";
import { floorOf, roomIdOf, slugTypeName } from "./rooms-catalog";
import { hashPassword } from "./password";
import { schedulePush } from "./push";
import { insertInBatches } from "./db/batch";

export async function audit(actorId: string, entity: string, entityId: string, action: string, before?: unknown, after?: unknown) {
  const db = await getDb();
  await db.insert(t.auditLogs).values({
    id: nid(),
    entity,
    entityId,
    action,
    actorId,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    createdAt: nowISO(),
  });
}

export async function notify(input: { userId?: string | null; role?: string | null; title: string; body: string; link?: string }) {
  const db = await getDb();
  await db.insert(t.notifications).values({
    id: nid(),
    userId: input.userId ?? null,
    role: input.role ?? null,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    read: false,
    createdAt: nowISO(),
  });
  await schedulePush(input);
}

export async function listUsers() {
  const db = await getDb();
  return db
    .select({
      id: t.users.id,
      username: t.users.username,
      fullName: t.users.fullName,
      role: t.users.role,
      departmentId: t.users.departmentId,
      departmentCode: t.departments.code,
      phone: t.users.phone,
      active: t.users.active,
    })
    .from(t.users)
    .innerJoin(t.departments, eq(t.users.departmentId, t.departments.id));
}

export type ReceptionDuty = {
  date: string;
  shiftType: ShiftType;
  userId: string | null;
  user: Awaited<ReturnType<typeof listUsers>>[number] | null;
  source: "week" | "adhoc";
  note: string | null;
};

export async function listReceptionists() {
  const people = await listUsers();
  return people.filter((p) => p.active && (p.role === "reception" || p.role === "manager"));
}

export async function receptionDuty(date: string, shiftType: ShiftType): Promise<ReceptionDuty> {
  const db = await getDb();
  const people = await listUsers();
  const override = (
    await db
      .select()
      .from(t.receptionDayOverrides)
      .where(and(eq(t.receptionDayOverrides.date, date), eq(t.receptionDayOverrides.shiftType, shiftType)))
      .limit(1)
  )[0];
  if (override) {
    return {
      date,
      shiftType,
      userId: override.userId,
      user: people.find((p) => p.id === override.userId) ?? null,
      source: "adhoc",
      note: override.note,
    };
  }
  const candidates = await db
    .select()
    .from(t.receptionWeekSlots)
    .where(and(eq(t.receptionWeekSlots.weekday, weekdayISO(date)), eq(t.receptionWeekSlots.shiftType, shiftType)));
  const slot = rosterVersionOf(candidates, date).slots[0];
  return {
    date,
    shiftType,
    userId: slot?.userId ?? null,
    user: slot ? people.find((p) => p.id === slot.userId) ?? null : null,
    source: "week",
    note: null,
  };
}

export async function receptionDutyDay(date: string) {
  const shifts = {
    morning: await receptionDuty(date, "morning"),
    afternoon: await receptionDuty(date, "afternoon"),
    night: await receptionDuty(date, "night"),
  };
  return { date, weekday: weekdayISO(date), shifts };
}

export async function listWeekRoster(date = todayVN()) {
  const db = await getDb();
  const rows = await db.select().from(t.receptionWeekSlots);
  return rosterVersionOf(rows, date);
}

function assertReceptionAssignee(people: Awaited<ReturnType<typeof listUsers>>, userId: string) {
  const person = people.find((p) => p.id === userId);
  if (!person || !person.active) throw new Error("Không tìm thấy lễ tân");
  if (person.role !== "reception" && person.role !== "manager") throw new Error("Chỉ gán lễ tân hoặc quản lý cover");
  return person;
}

function assertAdhocDate(date: string) {
  const today = todayVN();
  if (date !== today && date !== nextDate(today)) throw new Error("Chỉ đổi ca hôm nay hoặc ngày mai");
}

export async function saveWeekRoster(
  actor: SessionUser,
  slots: { weekday: number; shiftType: ShiftType; userId: string }[],
) {
  const db = await getDb();
  const people = await listUsers();
  const now = nowISO();
  const from = todayVN();
  if (slots.length < 21) throw new Error("Chọn đủ lễ tân cho 7 ngày × 3 ca");
  const seen = new Set<string>();
  for (const slot of slots) {
    if (slot.weekday < 1 || slot.weekday > 7) throw new Error("Ngày trong tuần không hợp lệ");
    assertReceptionAssignee(people, slot.userId);
    const key = `${slot.weekday}-${slot.shiftType}`;
    if (seen.has(key)) throw new Error("Trùng ca trong tuần");
    seen.add(key);
  }
  await db.delete(t.receptionWeekSlots).where(eq(t.receptionWeekSlots.effectiveFrom, from));
  await insertInBatches(
    (rows) => db.insert(t.receptionWeekSlots).values(rows),
    slots.map((slot) => ({
      id: weekSlotId(slot.weekday, slot.shiftType, from),
      weekday: slot.weekday,
      shiftType: slot.shiftType,
      userId: slot.userId,
      effectiveFrom: from,
    })),
  );
  await audit(actor.id, "roster_week", from, "save", null, { count: slots.length, effectiveFrom: from, at: now });
}

export async function saveDayOverrides(
  actor: SessionUser,
  date: string,
  assignments: { shiftType: ShiftType; userId: string }[],
  note?: string,
) {
  assertAdhocDate(date);
  const db = await getDb();
  const people = await listUsers();
  const now = nowISO();
  for (const item of assignments) {
    assertReceptionAssignee(people, item.userId);
    const weekUser = (await receptionDuty(date, item.shiftType)).userId;
    const id = dayOverrideId(date, item.shiftType);
    const existing = (await db.select().from(t.receptionDayOverrides).where(eq(t.receptionDayOverrides.id, id)).limit(1))[0];
    if (weekUser === item.userId) {
      if (existing) await db.delete(t.receptionDayOverrides).where(eq(t.receptionDayOverrides.id, id));
      continue;
    }
    if (existing) {
      await db
        .update(t.receptionDayOverrides)
        .set({ userId: item.userId, note: note || null, updatedAt: now })
        .where(eq(t.receptionDayOverrides.id, id));
    } else {
      await db.insert(t.receptionDayOverrides).values({
        id,
        date,
        shiftType: item.shiftType,
        userId: item.userId,
        note: note || null,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  await audit(actor.id, "roster_day", date, "save", null, { date, note });
}

export async function clearDayOverrides(actor: SessionUser, date: string) {
  assertAdhocDate(date);
  const db = await getDb();
  await db.delete(t.receptionDayOverrides).where(eq(t.receptionDayOverrides.date, date));
  await audit(actor.id, "roster_day", date, "clear", { date }, null);
}

export async function getDashboard(user: SessionUser) {
  const db = await getDb();
  const today = todayVN();
  const shift = await currentOpenShift();
  const rooms = await db.select().from(t.rooms);
  const stays = await db.select().from(t.stays);
  const requests = await db.select().from(t.guestRequests);
  const breakfast = (
    await db.select().from(t.breakfasts).where(eq(t.breakfasts.date, addDay(today, 1))).limit(1)
  )[0];
  const handover = await pendingHandover();
  const unread = await db
    .select()
    .from(t.notifications)
    .where(
      and(
        eq(t.notifications.read, false),
        or(eq(t.notifications.userId, user.id), eq(t.notifications.role, user.role)),
      ),
    );

  if (shift) await ensureShiftChecklists(db, shift, { actorId: user.id });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  const tasks = await db.select().from(t.tasks);

  const now = Date.now();
  return {
    shift,
    handover,
    rooms,
    stays,
    breakfast,
    unread: unread.length,
    nowTasks: tasks.filter((x) => ["new", "accepted", "in_progress", "blocked"].includes(x.status)),
    overdueTasks: tasks.filter((x) => x.dueAt && new Date(x.dueAt).getTime() < now && !["done", "checked"].includes(x.status)),
    arriving: stays.filter((s) => s.status === "arriving" && s.arrivalDate === today),
    departing: stays.filter((s) => s.status === "departing" && s.departureDate === today),
    noShow: stays.filter((s) => s.status === "no_show"),
    cleaning: rooms.filter((r) => r.hkStatus === "cleaning" || r.opsStatus === "cleaning"),
    ins: rooms.filter((r) => r.hkStatus === "ins" || r.opsStatus === "ins"),
    ooo: rooms.filter((r) => r.opsStatus === "ooo"),
    openRequests: requests.filter((r) => r.status === "open"),
    shiftEnd: shift ? shiftWindow(shift.type as ShiftType, shift.date).end : null,
    duty: await receptionDuty(today, (shift?.type as ShiftType) || currentShiftType()),
    tomorrowDuty: await receptionDutyDay(nextDate(today)),
  };
}

export async function currentOpenShift() {
  const db = await getDb();
  const rows = await db.select().from(t.shifts).where(eq(t.shifts.status, "open")).orderBy(desc(t.shifts.openedAt)).limit(1);
  return rows[0] ?? null;
}

export async function openShift(user: SessionUser, type?: ShiftType) {
  const db = await getDb();
  const existing = await currentOpenShift();
  if (existing) return existing;
  const shiftType = type ?? currentShiftType();
  const id = nid();
  const now = nowISO();
  await db.insert(t.shifts).values({
    id,
    type: shiftType,
    date: todayVN(),
    status: "open",
    openedAt: now,
    openedBy: user.id,
    closedAt: null,
    closedBy: null,
    closeReason: null,
  });
  const created = (await db.select().from(t.shifts).where(eq(t.shifts.id, id)))[0];
  await ensureShiftChecklists(db, created, { actorId: user.id });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "shift", id, "open", null, { type: shiftType });
  return created;
}

export async function getShiftBundle(shiftId: string, departmentCode?: string) {
  const db = await getDb();
  const shift = (await db.select().from(t.shifts).where(eq(t.shifts.id, shiftId)))[0];
  if (!shift) return null;
  const lists = (await db.select().from(t.checklists).where(eq(t.checklists.shiftId, shiftId))).filter(
    (row) => row.kind === "shift_open" || row.kind === "shift_close",
  );
  const filtered = departmentCode
    ? lists.filter((l) => l.departmentCode === departmentCode || departmentCode === "management")
    : lists;
  const items = await db.select().from(t.checklistItems);
  return {
    shift,
    checklists: filtered.map((c) => ({
      ...c,
      items: items.filter((i) => i.checklistId === c.id).sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  };
}

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

export async function closeShift(user: SessionUser, closeReason?: string) {
  const db = await getDb();
  const shift = await currentOpenShift();
  if (!shift) throw new Error("Không có ca đang mở");
  const ho = (await db.select().from(t.handovers).where(eq(t.handovers.fromShiftId, shift.id)))[0];
  if (!ho && !closeReason) {
    throw new Error("Chưa tạo bàn giao ca. Tạo bàn giao hoặc ghi lý do.");
  }
  await db
    .update(t.shifts)
    .set({ status: "closed", closedAt: nowISO(), closedBy: user.id, closeReason: closeReason || null })
    .where(eq(t.shifts.id, shift.id));
  await audit(user.id, "shift", shift.id, "close", shift, { closeReason });
  return true;
}

export async function listTasks(filter?: {
  status?: string;
  mine?: string;
  q?: string;
  kind?: string;
  group?: "room" | "general";
  column?: TaskBoardColumn;
}) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  let rows = await db.select().from(t.tasks).orderBy(desc(t.tasks.createdAt));
  if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter?.column) rows = rows.filter((r) => taskBoardColumn(r.status) === filter.column);
  if (!filter?.status && !filter?.column) rows = rows.filter((r) => r.status !== "archive");
  if (filter?.kind) rows = rows.filter((r) => r.kind === filter.kind);
  if (filter?.group === "room") rows = rows.filter((r) => !!r.roomId);
  if (filter?.group === "general") rows = rows.filter((r) => !r.roomId);
  if (filter?.mine) rows = rows.filter((r) => r.assigneeId === filter.mine || r.toDept === filter.mine);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter((r) => r.content.toLowerCase().includes(q) || (r.area || "").toLowerCase().includes(q));
  }
  return rows;
}

export async function getTask(id: string) {
  const db = await getDb();
  const task = (await db.select().from(t.tasks).where(eq(t.tasks.id, id)))[0];
  if (!task) return null;
  const history = await db.select().from(t.taskHistory).where(eq(t.taskHistory.taskId, id)).orderBy(desc(t.taskHistory.createdAt));
  const users = await db.select().from(t.users);
  const room = task.roomId ? (await db.select().from(t.rooms).where(eq(t.rooms.id, task.roomId)))[0] : null;
  const checklist = await loadChecklistByTask(db, id);
  return { task, history, users, room, checklist };
}

function parseDueAt(raw?: string) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return new Date(`${raw}:00+07:00`).toISOString();
  }
  return raw;
}

export async function createTask(user: SessionUser, data: {
  kind?: string;
  stayId?: string;
  fromDept: string;
  toDept?: string;
  roomId?: string;
  area?: string;
  content: string;
  priority?: string;
  assigneeId?: string;
  dueAt?: string;
  formCode?: string;
  photo?: string;
  zaloMessage?: string;
}) {
  const type = getTaskType(data.kind);
  if (!type.canCreate.includes(user.role)) {
    throw new Error(`Bạn không tạo được việc “${type.label}”`);
  }
  if (type.room === "required" && !data.roomId) {
    throw new Error(`Việc “${type.label}” cần gắn phòng`);
  }
  const toDept = data.toDept || type.toDept || user.departmentCode;
  if (data.assigneeId) {
    const people = await listUsers();
    const assignee = people.find((u) => u.id === data.assigneeId);
    if (!assignee || assignee.departmentCode !== toDept) {
      throw new Error("Người phụ trách phải thuộc bộ phận nhận việc");
    }
  }
  const dueAt =
    parseDueAt(data.dueAt) ||
    (type.due === "shift_end" ? shiftWindow(currentShiftType()).end : null);
  const roomId = type.room === "none" ? undefined : data.roomId;
  const db = await getDb();
  const id = nid();
  const now = nowISO();
  await db.insert(t.tasks).values({
    id,
    kind: type.kind,
    stayId: data.stayId || null,
    fromDept: data.fromDept,
    toDept,
    roomId: roomId || null,
    area: type.group === "general" ? data.area || "Chung" : data.area || null,
    content: data.content,
    priority: data.priority || type.priority,
    assigneeId: data.assigneeId || null,
    dueAt,
    formCode: data.formCode || "BM-13",
    status: "new",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: data.zaloMessage || null,
    zaloSent: false,
    zaloSentAt: null,
    photo: data.photo || null,
    createdBy: user.id,
    createdAt: now,
    updatedBy: user.id,
    updatedAt: now,
  });
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId: id,
    fromStatus: null,
    toStatus: "new",
    actorId: user.id,
    note: "Tạo công việc",
    createdAt: now,
  });
  await notify({
    role: toDept === "management" ? "manager" : toDept === "hk" ? "hk" : toDept,
    title: `Việc mới: ${type.label}`,
    body: data.content,
    link: `/tasks/${id}`,
  });
  await audit(user.id, "task", id, "create", null, data);
  return id;
}

const FLOW: Record<string, TaskStatus[]> = {
  new: ["accepted", "in_progress", "done", "blocked"],
  accepted: ["in_progress", "done", "blocked"],
  in_progress: ["done", "blocked"],
  done: ["checked", "in_progress", "archive"],
  blocked: ["accepted", "in_progress"],
  checked: ["archive"],
  archive: ["in_progress"],
};

export async function updateTaskStatus(user: SessionUser, id: string, toStatus: TaskStatus, note?: string, blocked?: { reason: string; action: string }) {
  const db = await getDb();
  const task = (await db.select().from(t.tasks).where(eq(t.tasks.id, id)))[0];
  if (!task) throw new Error("Không tìm thấy việc");
  if (toStatus === "blocked" && (!blocked?.reason || !blocked.action)) {
    throw new Error("Trạng thái Vướng bắt buộc ghi lý do và hướng xử lý");
  }
  const allowed = FLOW[task.status] ?? [];
  if (!allowed.includes(toStatus) && user.role !== "manager") {
    throw new Error("Không chuyển được trạng thái này");
  }
  await db
    .update(t.tasks)
    .set({
      status: toStatus,
      blockedReason: toStatus === "blocked" ? blocked?.reason : task.blockedReason,
      blockedAction: toStatus === "blocked" ? blocked?.action : task.blockedAction,
      updatedBy: user.id,
      updatedAt: nowISO(),
    })
    .where(eq(t.tasks.id, id));
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId: id,
    fromStatus: task.status,
    toStatus,
    actorId: user.id,
    note: note || (toStatus === "blocked" ? `${blocked?.reason} — ${blocked?.action}` : null),
    createdAt: nowISO(),
  });
  await audit(user.id, "task", id, "status", { status: task.status }, { status: toStatus });
}

export async function markZaloSent(user: SessionUser, id: string) {
  const db = await getDb();
  await db.update(t.tasks).set({ zaloSent: true, zaloSentAt: nowISO(), updatedBy: user.id, updatedAt: nowISO() }).where(eq(t.tasks.id, id));
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId: id,
    fromStatus: null,
    toStatus: "zalo_sent",
    actorId: user.id,
    note: "Đã gửi Zalo",
    createdAt: nowISO(),
  });
}

export async function saveZaloDraft(id: string, message: string) {
  const db = await getDb();
  await db.update(t.tasks).set({ zaloMessage: message, updatedAt: nowISO() }).where(eq(t.tasks.id, id));
}

export async function listRooms() {
  const db = await getDb();
  return db.select().from(t.rooms);
}

export async function listRoomTypes() {
  const db = await getDb();
  return db.select().from(t.roomTypes).orderBy(t.roomTypes.sortOrder, t.roomTypes.name);
}

export async function createRoomType(actor: SessionUser, name: string) {
  const db = await getDb();
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error("Nhập tên hạng phòng");
  const code = slugTypeName(trimmed);
  if (!code) throw new Error("Tên hạng phòng không hợp lệ");
  const exists = (await db.select({ id: t.roomTypes.id }).from(t.roomTypes).where(or(eq(t.roomTypes.code, code), eq(t.roomTypes.name, trimmed))).limit(1))[0];
  if (exists) throw new Error("Hạng phòng đã tồn tại");
  const last = (await db.select().from(t.roomTypes).orderBy(desc(t.roomTypes.sortOrder)).limit(1))[0];
  const id = `rt-${code}`;
  await db.insert(t.roomTypes).values({
    id,
    code,
    name: trimmed,
    sortOrder: (last?.sortOrder ?? 0) + 10,
    baseRate: 0,
    weekendRate: 0,
  });
  await audit(actor.id, "room_type", id, "create", null, { name: trimmed });
  return id;
}

export async function renameRoomType(actor: SessionUser, id: string, name: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy hạng phòng");
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error("Nhập tên hạng phòng");
  const clash = (await db.select({ id: t.roomTypes.id }).from(t.roomTypes).where(and(eq(t.roomTypes.name, trimmed), ne(t.roomTypes.id, id))).limit(1))[0];
  if (clash) throw new Error("Tên hạng phòng đã dùng");
  await db.update(t.roomTypes).set({ name: trimmed }).where(eq(t.roomTypes.id, id));
  await db.update(t.rooms).set({ type: trimmed, updatedAt: nowISO(), updatedBy: actor.id }).where(eq(t.rooms.type, before.name));
  await audit(actor.id, "room_type", id, "rename", before, { name: trimmed });
}

export async function deleteRoomType(actor: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy hạng phòng");
  const used = (await db.select({ id: t.rooms.id }).from(t.rooms).where(eq(t.rooms.type, before.name)).limit(1))[0];
  if (used) throw new Error("Còn phòng thuộc hạng này");
  await db.delete(t.roomTypes).where(eq(t.roomTypes.id, id));
  await audit(actor.id, "room_type", id, "delete", before, null);
}

export async function createManagedRoom(actor: SessionUser, number: string, typeName: string) {
  const db = await getDb();
  const num = number.trim();
  if (!/^\d{3,4}$/.test(num)) throw new Error("Số phòng 3–4 chữ số");
  const type = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.name, typeName.trim().toUpperCase())).limit(1))[0];
  if (!type) throw new Error("Chọn hạng phòng");
  const exists = (await db.select({ id: t.rooms.id }).from(t.rooms).where(eq(t.rooms.number, num)).limit(1))[0];
  if (exists) throw new Error("Số phòng đã tồn tại");
  const id = roomIdOf(num);
  const now = nowISO();
  await db.insert(t.rooms).values({
    id,
    number: num,
    floor: floorOf(num),
    type: type.name,
    opsStatus: "vacant_clean",
    hkStatus: "ins",
    assignedTo: null,
    oooReason: null,
    oooApproved: false,
    notes: null,
    updatedAt: now,
    updatedBy: actor.id,
  });
  await audit(actor.id, "room", id, "create", null, { number: num, type: type.name });
  return id;
}

export async function setRoomType(actor: SessionUser, id: string, typeName: string) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const type = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.name, typeName.trim().toUpperCase())).limit(1))[0];
  if (!type) throw new Error("Chọn hạng phòng");
  await db.update(t.rooms).set({ type: type.name, updatedAt: nowISO(), updatedBy: actor.id }).where(eq(t.rooms.id, id));
  await audit(actor.id, "room", id, "set_type", before, { type: type.name });
}

export async function deleteManagedRoom(actor: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const stays = await db.select().from(t.stays).where(eq(t.stays.roomId, id));
  if (stays.some((s) => ["inhouse", "arriving", "departing"].includes(s.status))) {
    throw new Error("Phòng đang có khách tham chiếu, không xóa");
  }
  const activeSales = await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, id));
  if (activeSales.some((sale) => isActiveSaleStatus(sale.status))) {
    throw new Error("Phòng đang có chỗ bán, không xóa");
  }
  await db.update(t.stays).set({ roomId: null }).where(eq(t.stays.roomId, id));
  await db.update(t.tasks).set({ roomId: null }).where(eq(t.tasks.roomId, id));
  await db.update(t.guestRequests).set({ roomId: null }).where(eq(t.guestRequests.roomId, id));
  await db.update(t.formSubmissions).set({ roomId: null }).where(eq(t.formSubmissions.roomId, id));
  await db.update(t.incidents).set({ roomId: null }).where(eq(t.incidents.roomId, id));
  await db.delete(t.roomSales).where(eq(t.roomSales.roomId, id));
  await db.delete(t.rooms).where(eq(t.rooms.id, id));
  await audit(actor.id, "room", id, "delete", before, null);
}

export async function getRoom(id: string) {
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)))[0];
  if (!room) return null;
  const stay = (await db.select().from(t.stays).where(eq(t.stays.roomId, id)))[0];
  const items = await db.select().from(t.formSubmissions).where(and(eq(t.formSubmissions.roomId, id), eq(t.formSubmissions.formCode, "BM-06")));
  const incidents = await db.select().from(t.incidents).where(eq(t.incidents.roomId, id));
  return { room, stay, checklists: items, incidents };
}

export async function updateRoom(user: SessionUser, id: string, patch: Partial<{
  opsStatus: string;
  hkStatus: string;
  assignedTo: string | null;
  oooReason: string | null;
  oooApproved: boolean;
  notes: string | null;
}>) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await db
    .update(t.rooms)
    .set({ ...clean, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.rooms.id, id));
  if (patch.hkStatus === "ins" && before.hkStatus !== "ins") {
    await notify({
      role: "reception",
      title: `P.${before.number} đã INS`,
      body: `${user.fullName} chuyển phòng sang sẵn sàng nhận khách`,
      link: `/rooms/${id}`,
    });
  }
  if (patch.opsStatus === "ooo") {
    await notify({
      role: "manager",
      title: `P.${before.number} báo OOO`,
      body: patch.oooReason || "Cần duyệt ngừng bán phòng",
      link: `/rooms/${id}`,
    });
  }
  await audit(user.id, "room", id, "update", before, patch);
}

type SaleInput = {
  roomId: string;
  guestName: string;
  guestPhone?: string;
  source: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  rate: number;
  discountKind?: string;
  discountValue?: number;
  deposit?: number;
  pmsCode?: string;
  notes?: string;
  checkinNow?: boolean;
  origin?: string;
};

async function syncStayFromSale(
  actorId: string,
  sale: {
    origin: string;
    source: string;
    pmsCode: string | null;
    roomId: string;
    guestName: string;
    guestPhone: string | null;
    status: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    notes: string | null;
  },
) {
  const pmsCode = sale.pmsCode?.trim();
  if (!pmsCode) return;
  const db = await getDb();
  const now = nowISO();
  const stayStatus = saleStatusToStay(sale.status);
  const existing = (await db.select().from(t.stays).where(eq(t.stays.pmsCode, pmsCode)).limit(1))[0];
  const origin = isSaleOrigin(sale.origin) ? sale.origin : existing?.origin === "ezcloud" ? "ezcloud" : "ops";
  const payload = {
    pmsCode,
    origin,
    source: parseSaleSource(sale.source),
    roomId: sale.roomId,
    guestName: sale.guestName,
    guestPhone: sale.guestPhone,
    status: stayStatus,
    arrivalDate: sale.checkIn,
    departureDate: sale.checkOut,
    adults: sale.adults,
    children: sale.children,
    notes: sale.notes || existing?.notes || null,
    updatedAt: now,
    updatedBy: actorId,
  };
  if (existing) {
    await db.update(t.stays).set({
      ...payload,
      pmsBookingOk: existing.pmsBookingOk || origin === "ops",
    }).where(eq(t.stays.id, existing.id));
    return;
  }
  const id = `s-${pmsCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${nid().slice(0, 8)}`;
  await db.insert(t.stays).values({
    id,
    ...payload,
    breakfast: true,
    pmsBookingOk: true,
    pmsCheckinOk: stayStatus === "inhouse" || stayStatus === "departed",
    pmsCheckoutOk: stayStatus === "departed",
    invoiceOk: false,
    paymentNote: null,
    checkinAt: stayStatus === "inhouse" || stayStatus === "departed" ? now : null,
    registrationDueAt: stayStatus === "inhouse" ? addMinutes(now, 30) : null,
    registrationDoneAt: null,
    registrationReason: null,
    createdAt: now,
    createdBy: actorId,
  });
}

function withSaleRoom<T extends { roomId: string }>(sale: T, rooms: { id: string; number: string; type: string; floor: number; opsStatus: string }[]) {
  return { ...sale, room: rooms.find((room) => room.id === sale.roomId) ?? null };
}

async function overlappingSale(roomId: string, checkIn: string, checkOut: string, exceptId?: string) {
  const db = await getDb();
  const rows = await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, roomId));
  return rows.find(
    (sale) =>
      sale.id !== exceptId &&
      isActiveSaleStatus(sale.status) &&
      rangesOverlap(checkIn, checkOut, sale.checkIn, sale.checkOut),
  );
}

async function assertSaleWindow(roomId: string, checkIn: string, checkOut: string, exceptId?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw new Error("Ngày nhận / trả không hợp lệ");
  }
  if (checkOut <= checkIn) throw new Error("Ngày trả phải sau ngày nhận");
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, roomId)).limit(1))[0];
  if (!room) throw new Error("Chọn phòng");
  if (room.opsStatus === "ooo") throw new Error(`P.${room.number} đang OOO, không bán`);
  const clash = await overlappingSale(roomId, checkIn, checkOut, exceptId);
  if (clash) {
    throw new Error(`P.${room.number} đã bán ${clash.checkIn} → ${clash.checkOut} (${clash.guestName})`);
  }
  return room;
}

export async function listRoomSales() {
  const db = await getDb();
  const [sales, rooms] = await Promise.all([db.select().from(t.roomSales), db.select().from(t.rooms)]);
  return sales
    .map((sale) => withSaleRoom(sale, rooms))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn) || (a.room?.number || "").localeCompare(b.room?.number || ""));
}

export async function getRoomSale(id: string) {
  const sales = await listRoomSales();
  return sales.find((sale) => sale.id === id) ?? null;
}

export async function salesBoard(date: string) {
  const [rooms, types, sales] = await Promise.all([listRooms(), listRoomTypes(), listRoomSales()]);
  const nightSales = sales.filter((sale) => isActiveSaleStatus(sale.status) && occupiesNight(sale.checkIn, sale.checkOut, date));
  const byRoom = new Map(nightSales.map((sale) => [sale.roomId, sale]));
  const cells = rooms
    .slice()
    .sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number))
    .map((room) => {
      const sale = byRoom.get(room.id) ?? null;
      const kind =
        room.opsStatus === "ooo" ? "ooo" : sale?.status === "inhouse" ? "inhouse" : sale ? "reserved" : "vacant";
      return { room, sale, kind };
    });
  const vacant = cells.filter((cell) => cell.kind === "vacant").length;
  const reserved = cells.filter((cell) => cell.kind === "reserved").length;
  const inhouse = cells.filter((cell) => cell.kind === "inhouse").length;
  const ooo = cells.filter((cell) => cell.kind === "ooo").length;
  const revenue = nightSales.reduce((sum, sale) => sum + nightlyNet(sale), 0);
  const upcoming = sales
    .filter((sale) => sale.status === "reserved" && sale.checkIn > date && sale.checkIn <= addDaysVN(date, 14))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return { date, types, cells, vacant, reserved, inhouse, ooo, sold: reserved + inhouse, revenue, nightSales, upcoming };
}

export async function createRoomSale(user: SessionUser, data: SaleInput) {
  const guestName = data.guestName.trim();
  if (!guestName) throw new Error("Nhập tên khách");
  if (!isSaleSource(data.source)) throw new Error("Chọn nền tảng booking");
  const origin = data.origin === "ezcloud" ? "ezcloud" : "ops";
  if (origin === "ezcloud" && !data.pmsCode?.trim()) throw new Error("Tích ezCloud thì nhập mã PMS");
  const room = await assertSaleWindow(data.roomId, data.checkIn, data.checkOut);
  const today = todayVN();
  const checkinNow = Boolean(data.checkinNow) && data.checkIn <= today;
  const status: SaleStatus = checkinNow ? "inhouse" : "reserved";
  const { discountKind, discountValue } = normalizeDiscount(data.discountKind, data.discountValue);
  const quote = saleQuote({ rate: Math.max(0, data.rate), checkIn: data.checkIn, checkOut: data.checkOut, discountKind, discountValue });
  const id = nid();
  const now = nowISO();
  const pmsCode = data.pmsCode?.trim() || (origin === "ops" ? `OPS-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}` : "");
  if (!pmsCode) throw new Error("Tích ezCloud thì nhập mã PMS");
  const row = {
    id,
    roomId: room.id,
    guestName,
    guestPhone: data.guestPhone?.trim() || null,
    origin,
    source: data.source,
    status,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    adults: Math.max(1, data.adults || 1),
    children: Math.max(0, data.children || 0),
    rate: Math.max(0, data.rate),
    discountKind,
    discountValue,
    deposit: Math.max(0, data.deposit || 0),
    pmsCode,
    notes: data.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    updatedBy: user.id,
  };
  const db = await getDb();
  await db.insert(t.roomSales).values(row);
  await syncStayFromSale(user.id, row);
  const dbAfter = await getDb();
  await ensureTodayRoomTasks(dbAfter, { actorId: user.id });
  await notify({
    role: user.role === "manager" ? "reception" : "manager",
    title: `Bán P.${room.number} · ${guestName}`,
    body: `${data.checkIn} → ${data.checkOut} · ${quote.total.toLocaleString("vi-VN")}₫`,
    link: `/sales/${id}`,
  });
  await audit(user.id, "room_sale", id, "create", null, row);
  return id;
}

export async function updateRoomSale(user: SessionUser, id: string, data: SaleInput) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng, không sửa");
  const guestName = data.guestName.trim();
  if (!guestName) throw new Error("Nhập tên khách");
  if (!isSaleSource(data.source)) throw new Error("Chọn nền tảng booking");
  const origin = data.origin === "ezcloud" ? "ezcloud" : "ops";
  if (origin === "ezcloud" && !data.pmsCode?.trim() && isOpsBookingCode(before.pmsCode)) {
    throw new Error("Tích ezCloud thì nhập mã PMS");
  }
  await assertSaleWindow(data.roomId, data.checkIn, data.checkOut, id);
  const { discountKind, discountValue } = normalizeDiscount(data.discountKind, data.discountValue);
  const pmsCode = data.pmsCode?.trim() || before.pmsCode;
  if (origin === "ezcloud" && (!pmsCode || isOpsBookingCode(pmsCode))) {
    throw new Error("Tích ezCloud thì nhập mã PMS");
  }
  const patch = {
    roomId: data.roomId,
    guestName,
    guestPhone: data.guestPhone?.trim() || null,
    origin,
    source: data.source,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    adults: Math.max(1, data.adults || 1),
    children: Math.max(0, data.children || 0),
    rate: Math.max(0, data.rate),
    discountKind,
    discountValue,
    deposit: Math.max(0, data.deposit || 0),
    pmsCode,
    notes: data.notes?.trim() || null,
    updatedAt: nowISO(),
    updatedBy: user.id,
  };
  await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, ...patch });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "update", before, patch);
}

export async function checkinRoomSale(user: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (before.status !== "reserved") throw new Error("Chỉ nhận phòng khi đang giữ chỗ");
  const today = todayVN();
  if (today < before.checkIn) throw new Error("Chưa đến ngày nhận phòng");
  await db
    .update(t.roomSales)
    .set({ status: "inhouse", updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status: "inhouse" });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "checkin", before, { status: "inhouse" });
}

export async function checkoutRoomSale(user: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (before.status !== "inhouse") throw new Error("Chỉ trả phòng khi khách đang ở");
  const today = todayVN();
  const checkOut = today < before.checkOut ? today : before.checkOut;
  if (checkOut <= before.checkIn) throw new Error("Ngày trả không hợp lệ");
  await db
    .update(t.roomSales)
    .set({ status: "departed", checkOut, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status: "departed", checkOut });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "checkout", before, { status: "departed", checkOut });
}

export async function cancelRoomSale(user: SessionUser, id: string, asNoShow = false) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng");
  if (asNoShow && before.status !== "reserved") throw new Error("No-show chỉ áp dụng chỗ đang giữ");
  const status: SaleStatus = asNoShow ? "no_show" : "cancelled";
  await db
    .update(t.roomSales)
    .set({ status, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, asNoShow ? "no_show" : "cancel", before, { status });
}

export async function setRoomTypeRates(user: SessionUser, rates: { id: string; baseRate: number; weekendRate: number }[]) {
  if (!can(user.role, "manageRates")) throw new Error("Chỉ quản lý sửa giá phòng");
  const db = await getDb();
  for (const row of rates) {
    const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, row.id)).limit(1))[0];
    if (!before) continue;
    const next = { baseRate: Math.max(0, row.baseRate), weekendRate: Math.max(0, row.weekendRate) };
    await db.update(t.roomTypes).set(next).where(eq(t.roomTypes.id, row.id));
    if (before.baseRate !== next.baseRate || before.weekendRate !== next.weekendRate) {
      await audit(user.id, "room_type", row.id, "rate", before, next);
    }
  }
}

export async function listStays() {
  const db = await getDb();
  const stays = await db.select().from(t.stays);
  const rooms = await db.select().from(t.rooms);
  const vehicles = await db.select().from(t.vehicles);
  const requests = await db.select().from(t.guestRequests);
  const tasks = await db.select().from(t.tasks);
  return stays.map((s) => ({
    ...s,
    room: rooms.find((r) => r.id === s.roomId) ?? null,
    vehicles: vehicles.filter((v) => v.stayId === s.id),
    requests: requests.filter((r) => r.stayId === s.id),
    tasks: tasks.filter((task) => task.stayId === s.id),
  }));
}

export async function getStay(id: string) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  const all = await listStays();
  const stay = all.find((s) => s.id === id) ?? null;
  if (!stay) return null;
  const byStay = await loadChecklistsForStay(db, id);
  const byRoom = stay.roomId ? await loadChecklistsForRoom(db, stay.roomId) : [];
  const seen = new Set<string>();
  const checklists = [...byStay, ...byRoom].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return { ...stay, checklists };
}

export async function getRoomDayChecklists(roomId: string) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  return loadChecklistsForRoom(db, roomId);
}

export async function updateStay(user: SessionUser, id: string, patch: Record<string, unknown>) {
  const db = await getDb();
  const before = (await db.select().from(t.stays).where(eq(t.stays.id, id)))[0];
  if (!before) throw new Error("Không tìm thấy booking tham chiếu");
  const next = { ...patch, updatedAt: nowISO(), updatedBy: user.id } as Record<string, unknown>;
  if (patch.pmsCheckinOk && !before.pmsCheckinOk && !before.registrationDueAt) {
    const start = nowISO();
    next.checkinAt = before.checkinAt || start;
    next.registrationDueAt = addMinutes(String(next.checkinAt), 30);
    if (before.status === "arriving" || before.status === "no_show") next.status = "inhouse";
  }
  await db.update(t.stays).set(next as typeof t.stays.$inferInsert).where(eq(t.stays.id, id));
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "stay", id, "update", before, next);
}

export async function addVehicle(user: SessionUser, stayId: string, data: { vehicleType: string; plate: string; location?: string; keyLocation?: string }) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.vehicles).values({
    id,
    stayId,
    vehicleType: data.vehicleType,
    plate: data.plate,
    location: data.location || null,
    keyLocation: data.keyLocation || null,
    notes: null,
    createdAt: nowISO(),
  });
  await audit(user.id, "vehicle", id, "create", null, data);
}

export async function addGuestRequest(user: SessionUser, data: {
  stayId?: string;
  roomId?: string;
  kind: string;
  content: string;
  quantity: number;
  dueAt?: string;
  assigneeId?: string;
}) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.guestRequests).values({
    id,
    stayId: data.stayId || null,
    roomId: data.roomId || null,
    kind: data.kind,
    content: data.content,
    quantity: data.quantity,
    dueAt: data.dueAt || null,
    assigneeId: data.assigneeId || null,
    status: "open",
    createdBy: user.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  await audit(user.id, "guest_request", id, "create", null, data);
  return id;
}

export async function completeRequest(user: SessionUser, id: string) {
  const db = await getDb();
  await db.update(t.guestRequests).set({ status: "done", updatedAt: nowISO() }).where(eq(t.guestRequests.id, id));
  await audit(user.id, "guest_request", id, "done");
}

export async function pendingHandover() {
  const db = await getDb();
  const rows = await db.select().from(t.handovers).where(eq(t.handovers.status, "submitted")).orderBy(desc(t.handovers.createdAt)).limit(1);
  if (!rows[0]) return null;
  const items = await db.select().from(t.handoverItems).where(eq(t.handoverItems.handoverId, rows[0].id));
  return { ...rows[0], items };
}

export async function listHandovers() {
  const db = await getDb();
  const rows = await db.select().from(t.handovers).orderBy(desc(t.handovers.createdAt));
  const items = await db.select().from(t.handoverItems);
  const users = await db.select().from(t.users);
  return rows.map((h) => ({
    ...h,
    items: items.filter((i) => i.handoverId === h.id),
    creator: users.find((u) => u.id === h.createdBy),
    acceptor: users.find((u) => u.id === h.acceptedBy),
  }));
}

function stayTag(s: { pmsCode: string; guestName: string; room?: { number: string } | null }) {
  return `${s.pmsCode} ${s.guestName} — P.${s.room?.number || "—"}`;
}

export async function buildHandoverDraft() {
  const stays = await listStays();
  const rooms = await listRooms();
  const tasks = await listTasks();
  const requests = stays.flatMap((s) => s.requests.map((r) => ({ ...r, room: s.room?.number })));
  const items: { category: string; refType: string; refId: string; summary: string }[] = [];
  const openTask = new Set(["new", "accepted", "in_progress"]);

  for (const s of stays.filter((x) => x.status === "arriving")) {
    items.push({ category: "Khách đến chưa nhận", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => x.status === "no_show")) {
    items.push({ category: "Khách chưa đến", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => ["arriving", "inhouse", "departing", "no_show"].includes(x.status) && x.notes)) {
    items.push({
      category: "Ghi chú khách",
      refType: "stay",
      refId: s.id,
      summary: `P.${s.room?.number || "—"} ${s.guestName}: ${s.notes}`,
    });
  }
  for (const s of stays.filter((x) => x.status === "inhouse" && x.registrationDueAt && !x.registrationDoneAt)) {
    items.push({ category: "Đăng ký lưu trú chưa xong", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => x.status === "departing" && (!x.invoiceOk || !x.pmsCheckoutOk))) {
    items.push({
      category: "Khách đi — hóa đơn / PMS",
      refType: "stay",
      refId: s.id,
      summary: `${stayTag(s)} chưa xác nhận hóa đơn hoặc check-out PMS`,
    });
  }
  for (const s of stays) {
    for (const v of s.vehicles) {
      const bits = [`P.${s.room?.number || "—"}`, v.vehicleType, v.plate];
      if (v.location) bits.push(v.location);
      if (v.keyLocation) bits.push(`chìa ${v.keyLocation}`);
      items.push({ category: "Khách gửi xe", refType: "vehicle", refId: v.id, summary: bits.join(" · ") });
    }
  }
  for (const r of requests.filter((x) => x.status === "open")) {
    const qty = r.quantity > 1 ? ` ×${r.quantity}` : "";
    items.push({
      category: "Yêu cầu khách chưa xong",
      refType: "request",
      refId: r.id,
      summary: `P.${r.room || "—"} ${requestKindLabel(r.kind)}: ${r.content}${qty}`,
    });
  }
  for (const task of tasks.filter((x) => openTask.has(x.status) || x.status === "blocked")) {
    const room = rooms.find((rm) => rm.id === task.roomId);
    const loc = room ? `P.${room.number}` : task.area || DEPT_LABEL[task.toDept as DepartmentCode] || task.toDept;
    const status = TASK_STATUS_LABEL[task.status as TaskStatus] || task.status;
    const extra =
      task.status === "blocked" && task.blockedReason
        ? ` — vướng: ${task.blockedReason}`
        : task.zaloSent
          ? ""
          : " · chưa gửi Zalo";
    items.push({
      category: task.status === "blocked" ? "Việc vướng" : "Việc đang dở",
      refType: "task",
      refId: task.id,
      summary: `${loc}: ${taskTypeLabel(task.kind)} — ${task.content} (${status})${extra}`,
    });
  }
  for (const r of rooms.filter((x) => x.opsStatus === "ooo")) {
    items.push({ category: "Phòng OOO / đang sửa", refType: "room", refId: r.id, summary: `P.${r.number} ${r.oooReason || ""}` });
  }
  for (const r of rooms.filter(
    (x) =>
      x.opsStatus !== "ooo" &&
      (["vacant_dirty", "cleaning", "waiting_inspect"].includes(x.opsStatus) ||
        ["waiting", "accepted", "cleaning", "waiting_inspect"].includes(x.hkStatus)),
  )) {
    items.push({
      category: "Phòng đang dọn / chờ kiểm",
      refType: "room",
      refId: r.id,
      summary: `P.${r.number} ${HK_LABEL[r.hkStatus as HkStatus] || r.hkStatus}`,
    });
  }
  return items;
}

export async function createHandover(user: SessionUser, notes: string) {
  const db = await getDb();
  const shift = await currentOpenShift();
  if (!shift) throw new Error("Hãy mở ca trước khi bàn giao");
  const existing = (await db.select().from(t.handovers).where(eq(t.handovers.fromShiftId, shift.id)))[0];
  if (existing) return existing.id;
  const id = nid();
  const items = await buildHandoverDraft();
  await db.insert(t.handovers).values({
    id,
    fromShiftId: shift.id,
    toShiftType: nextShift(shift.type as ShiftType),
    status: "submitted",
    createdBy: user.id,
    createdAt: nowISO(),
    acceptedBy: null,
    acceptedAt: null,
    notes,
  });
  if (items.length) {
    await db.insert(t.handoverItems).values(
      items.map((item) => ({
        id: nid(),
        handoverId: id,
        category: item.category,
        refType: item.refType,
        refId: item.refId,
        summary: item.summary,
        note: null,
      })),
    );
  }
  const next = nextShiftSlot(shift.type as ShiftType, shift.date);
  const nextDuty = await receptionDuty(next.date, next.type);
  await notify({
    userId: nextDuty.userId,
    role: "reception",
    title: "Bàn giao ca mới",
    body: `${user.fullName} đã gửi bàn giao. Ca sau cần bấm Đã nhận.`,
    link: `/handover/${id}`,
  });
  await audit(user.id, "handover", id, "create", null, { notes, count: items.length });
  return id;
}

export async function acceptHandover(user: SessionUser, id: string) {
  const db = await getDb();
  const ho = (await db.select().from(t.handovers).where(eq(t.handovers.id, id)))[0];
  if (!ho) throw new Error("Không tìm thấy bàn giao");
  if (ho.acceptedBy) throw new Error("Bàn giao đã được nhận");
  await db.update(t.handovers).set({ status: "accepted", acceptedBy: user.id, acceptedAt: nowISO() }).where(eq(t.handovers.id, id));
  await audit(user.id, "handover", id, "accept", ho, { acceptedBy: user.id });
}

export async function getBreakfast(date: string) {
  const db = await getDb();
  return (await db.select().from(t.breakfasts).where(eq(t.breakfasts.date, date)))[0] ?? null;
}

export async function upsertBreakfast(user: SessionUser, date: string, data: Record<string, unknown>) {
  const db = await getDb();
  const existing = await getBreakfast(date);
  if (existing) {
    await db.update(t.breakfasts).set({ ...data, updatedAt: nowISO() }).where(eq(t.breakfasts.id, existing.id));
    await audit(user.id, "breakfast", existing.id, "update", existing, data);
    return existing.id;
  }
  const id = nid();
  await db.insert(t.breakfasts).values({
    id,
    date,
    adults: Number(data.adults || 0),
    children: Number(data.children || 0),
    vegetarian: Number(data.vegetarian || 0),
    allergy: Number(data.allergy || 0),
    early: Number(data.early || 0),
    takeaway: Number(data.takeaway || 0),
    notes: String(data.notes || ""),
    sentBy: user.id,
    confirmedBy: null,
    confirmedAt: null,
    actualAdults: null,
    actualChildren: null,
    updatedAt: nowISO(),
  });
  await notify({ role: "kitchen", title: "Số ăn sáng mới", body: `Lễ tân gửi dự báo ngày ${date}`, link: "/kitchen" });
  return id;
}

export async function confirmBreakfast(user: SessionUser, date: string) {
  const db = await getDb();
  const row = await getBreakfast(date);
  if (!row) throw new Error("Chưa có số ăn sáng");
  await db.update(t.breakfasts).set({ confirmedBy: user.id, confirmedAt: nowISO(), updatedAt: nowISO() }).where(eq(t.breakfasts.id, row.id));
  await notify({ role: "reception", title: "Bếp đã nhận số", body: `${user.fullName} xác nhận ăn sáng ${date}`, link: "/kitchen" });
}

export async function listForms(q?: { code?: string; date?: string; room?: string; staff?: string }) {
  const db = await getDb();
  let rows = await db.select().from(t.formSubmissions).where(sql`${t.formSubmissions.deletedAt} is null`).orderBy(desc(t.formSubmissions.createdAt));
  if (q?.code) rows = rows.filter((r) => r.formCode === q.code);
  if (q?.date) rows = rows.filter((r) => r.date === q.date);
  if (q?.room) rows = rows.filter((r) => r.roomId === q.room);
  if (q?.staff) rows = rows.filter((r) => r.submittedBy === q.staff);
  return rows;
}

export async function getForm(id: string) {
  const db = await getDb();
  return (await db.select().from(t.formSubmissions).where(eq(t.formSubmissions.id, id)))[0] ?? null;
}

export async function saveForm(user: SessionUser, data: {
  formCode: string;
  payload: unknown;
  signature?: string;
  roomId?: string;
  stayId?: string;
  shiftId?: string;
}) {
  const db = await getDb();
  const id = nid();
  const now = nowISO();
  await db.insert(t.formSubmissions).values({
    id,
    formCode: data.formCode,
    shiftId: data.shiftId || null,
    roomId: data.roomId || null,
    stayId: data.stayId || null,
    date: todayVN(),
    payload: JSON.stringify(data.payload),
    signature: data.signature || null,
    submittedBy: user.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await audit(user.id, "form", id, "create", null, { formCode: data.formCode });
  return id;
}

export async function listIncidents() {
  const db = await getDb();
  return db.select().from(t.incidents).orderBy(desc(t.incidents.createdAt));
}

export async function createIncident(user: SessionUser, data: {
  type: string;
  location?: string;
  roomId?: string;
  description: string;
  severity: string;
  photo?: string;
}) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.incidents).values({
    id,
    type: data.type,
    location: data.location || null,
    roomId: data.roomId || null,
    description: data.description,
    severity: data.severity,
    status: "pending",
    photo: data.photo || null,
    reportedBy: user.id,
    approvedBy: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  await notify({ role: "manager", title: "Sự cố mới", body: data.description, link: "/incidents" });
  await audit(user.id, "incident", id, "create", null, data);
  return id;
}

export async function approveIncident(user: SessionUser, id: string) {
  const db = await getDb();
  await db.update(t.incidents).set({ status: "approved", approvedBy: user.id, updatedAt: nowISO() }).where(eq(t.incidents.id, id));
}

export async function listNotifications(user: SessionUser) {
  const db = await getDb();
  return db
    .select()
    .from(t.notifications)
    .where(or(eq(t.notifications.userId, user.id), eq(t.notifications.role, user.role), sql`${t.notifications.userId} is null`))
    .orderBy(desc(t.notifications.createdAt));
}

export async function markNotifRead(id: string) {
  const db = await getDb();
  await db.update(t.notifications).set({ read: true }).where(eq(t.notifications.id, id));
}

export async function searchOps(q: string) {
  const db = await getDb();
  const query = `%${q}%`;
  const stays = await db.select().from(t.stays).where(or(like(t.stays.pmsCode, query), like(t.stays.guestName, query)));
  const tasks = await db.select().from(t.tasks).where(like(t.tasks.content, query));
  const forms = await db.select().from(t.formSubmissions).where(like(t.formSubmissions.formCode, query));
  return { stays, tasks, forms };
}

export async function overdueReport() {
  const tasks = await listTasks();
  const stays = await listStays();
  const now = Date.now();
  return {
    tasks: tasks.filter((t0) => t0.dueAt && new Date(t0.dueAt).getTime() < now && !["done", "checked"].includes(t0.status)),
    registrations: stays.filter((s) => s.registrationDueAt && !s.registrationDoneAt && new Date(s.registrationDueAt).getTime() < now),
    checkouts: stays.filter((s) => s.status === "departing" && (!s.invoiceOk || !s.pmsCheckoutOk)),
  };
}

function nextShift(type: ShiftType): ShiftType {
  if (type === "morning") return "afternoon";
  if (type === "afternoon") return "night";
  return "morning";
}

function addDay(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export async function listDepartments() {
  const db = await getDb();
  return db.select().from(t.departments);
}

export async function getStaff(id: string) {
  const people = await listUsers();
  return people.find((u) => u.id === id) ?? null;
}

export async function createStaff(
  actor: SessionUser,
  data: { username: string; password: string; fullName: string; role: Role; phone?: string },
) {
  const db = await getDb();
  const username = data.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Tài khoản 3–32 ký tự, chỉ chữ thường, số, . _ -");
  if (data.password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  if (!data.fullName.trim()) throw new Error("Nhập họ tên");
  const exists = (await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.username, username)).limit(1))[0];
  if (exists) throw new Error("Tài khoản đã tồn tại");
  const deptCode = ROLE_DEPT[data.role];
  const dept = (await db.select().from(t.departments).where(eq(t.departments.code, deptCode)).limit(1))[0];
  if (!dept) throw new Error("Không tìm thấy bộ phận");
  const id = nid();
  const now = nowISO();
  await db.insert(t.users).values({
    id,
    username,
    passwordHash: await hashPassword(data.password),
    fullName: data.fullName.trim(),
    role: data.role,
    departmentId: dept.id,
    phone: data.phone?.trim() || null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  await audit(actor.id, "user", id, "create", null, { username, role: data.role, fullName: data.fullName });
  return id;
}

export async function updateStaff(
  actor: SessionUser,
  id: string,
  data: { fullName: string; role: Role; phone?: string },
) {
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  const deptCode = ROLE_DEPT[data.role];
  const dept = (await db.select().from(t.departments).where(eq(t.departments.code, deptCode)).limit(1))[0];
  if (!dept) throw new Error("Không tìm thấy bộ phận");
  await db
    .update(t.users)
    .set({
      fullName: data.fullName.trim(),
      role: data.role,
      departmentId: dept.id,
      phone: data.phone?.trim() || null,
      updatedAt: nowISO(),
    })
    .where(eq(t.users.id, id));
  await audit(actor.id, "user", id, "update", before, data);
}

export async function setStaffActive(actor: SessionUser, id: string, active: boolean) {
  if (id === actor.id) throw new Error("Không khóa tài khoản đang đăng nhập");
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  if (!active && before.role === "manager") {
    const others = await db.select().from(t.users);
    const remaining = others.filter((u) => u.role === "manager" && u.active && u.id !== id);
    if (remaining.length === 0) throw new Error("Phải còn ít nhất một quản lý đang hoạt động");
  }
  await db.update(t.users).set({ active, updatedAt: nowISO() }).where(eq(t.users.id, id));
  await audit(actor.id, "user", id, active ? "unlock" : "lock", { active: before.active }, { active });
}

export async function resetStaffPassword(actor: SessionUser, id: string, password: string) {
  if (password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  await db
    .update(t.users)
    .set({ passwordHash: await hashPassword(password), updatedAt: nowISO() })
    .where(eq(t.users.id, id));
  await audit(actor.id, "user", id, "reset_password", { username: before.username }, { reset: true });
}
