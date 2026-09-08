import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import * as t from "./db/schema";
import { addMinutes, currentShiftType, nid, nowISO, shiftWindow, todayVN } from "./datetime";
import { shiftChecklistTemplate } from "./checklists";
import type { DepartmentCode, Role, SessionUser, ShiftType, TaskStatus } from "./types";
import { ROLE_DEPT, SHIFT_LABEL } from "./constants";
import { hashPassword } from "./password";

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

export async function getDashboard(user: SessionUser) {
  const db = await getDb();
  const today = todayVN();
  const shift = await currentOpenShift();
  const rooms = await db.select().from(t.rooms);
  const stays = await db.select().from(t.stays);
  const tasks = await db.select().from(t.tasks);
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
  const depts: DepartmentCode[] = ["reception", "hk", "kitchen", "utility", "management"];
  for (const dept of depts) {
    const cid = nid();
    await db.insert(t.checklists).values({
      id: cid,
      shiftId: id,
      departmentCode: dept,
      title: `Checklist ${SHIFT_LABEL[shiftType]} — ${dept}`,
    });
    const items = shiftChecklistTemplate(shiftType, dept);
    if (items.length) {
      await db.insert(t.checklistItems).values(
        items.map((item, i) => ({
          id: nid(),
          checklistId: cid,
          label: item.label,
          required: item.required,
          done: false,
          doneBy: null,
          doneAt: null,
          skipReason: null,
          sortOrder: i,
        })),
      );
    }
  }
  await audit(user.id, "shift", id, "open", null, { type: shiftType });
  return (await db.select().from(t.shifts).where(eq(t.shifts.id, id)))[0];
}

export async function getShiftBundle(shiftId: string, departmentCode?: string) {
  const db = await getDb();
  const shift = (await db.select().from(t.shifts).where(eq(t.shifts.id, shiftId)))[0];
  if (!shift) return null;
  const lists = await db.select().from(t.checklists).where(eq(t.checklists.shiftId, shiftId));
  const filtered = departmentCode ? lists.filter((l) => l.departmentCode === departmentCode || departmentCode === "management") : lists;
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
}

export async function skipChecklistItem(user: SessionUser, itemId: string, reason: string) {
  const db = await getDb();
  await db
    .update(t.checklistItems)
    .set({ skipReason: reason, done: true, doneBy: user.id, doneAt: nowISO() })
    .where(eq(t.checklistItems.id, itemId));
  await audit(user.id, "checklist_item", itemId, "skip", null, { reason });
}

export function unfinishedRequired(items: { required: boolean; done: boolean; skipReason: string | null }[]) {
  return items.filter((i) => i.required && !i.done && !i.skipReason);
}

export async function closeShift(user: SessionUser, closeReason?: string) {
  const db = await getDb();
  const shift = await currentOpenShift();
  if (!shift) throw new Error("Không có ca đang mở");
  const bundle = await getShiftBundle(shift.id, user.role === "manager" ? undefined : user.departmentCode);
  const items = bundle?.checklists.flatMap((c) => c.items) ?? [];
  const blocked = unfinishedRequired(items);
  if (blocked.length && !closeReason) {
    throw new Error(`Còn ${blocked.length} mục bắt buộc chưa xử lý. Ghi lý do để kết ca.`);
  }
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

export async function listTasks(filter?: { status?: string; mine?: string; q?: string }) {
  const db = await getDb();
  let rows = await db.select().from(t.tasks).orderBy(desc(t.tasks.createdAt));
  if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
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
  return { task, history, users, room };
}

export async function createTask(user: SessionUser, data: {
  fromDept: string;
  toDept: string;
  roomId?: string;
  area?: string;
  content: string;
  priority: string;
  assigneeId?: string;
  dueAt?: string;
  formCode?: string;
  photo?: string;
  zaloMessage?: string;
}) {
  if (data.assigneeId) {
    const people = await listUsers();
    const assignee = people.find((u) => u.id === data.assigneeId);
    if (!assignee || assignee.departmentCode !== data.toDept) {
      throw new Error("Người phụ trách phải thuộc bộ phận nhận việc");
    }
  }
  const db = await getDb();
  const id = nid();
  const now = nowISO();
  await db.insert(t.tasks).values({
    id,
    fromDept: data.fromDept,
    toDept: data.toDept,
    roomId: data.roomId || null,
    area: data.area || null,
    content: data.content,
    priority: data.priority,
    assigneeId: data.assigneeId || null,
    dueAt: data.dueAt || null,
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
    role: data.toDept,
    title: "Việc liên bộ phận mới",
    body: data.content,
    link: `/tasks/${id}`,
  });
  await audit(user.id, "task", id, "create", null, data);
  return id;
}

const FLOW: Record<string, TaskStatus[]> = {
  new: ["accepted", "blocked"],
  accepted: ["in_progress", "blocked"],
  in_progress: ["done", "blocked"],
  done: ["checked", "in_progress"],
  blocked: ["accepted", "in_progress"],
  checked: [],
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

export async function listStays() {
  const db = await getDb();
  const stays = await db.select().from(t.stays);
  const rooms = await db.select().from(t.rooms);
  const vehicles = await db.select().from(t.vehicles);
  const requests = await db.select().from(t.guestRequests);
  return stays.map((s) => ({
    ...s,
    room: rooms.find((r) => r.id === s.roomId) ?? null,
    vehicles: vehicles.filter((v) => v.stayId === s.id),
    requests: requests.filter((r) => r.stayId === s.id),
  }));
}

export async function getStay(id: string) {
  const all = await listStays();
  return all.find((s) => s.id === id) ?? null;
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

export async function buildHandoverDraft() {
  const stays = await listStays();
  const rooms = await listRooms();
  const tasks = await listTasks();
  const requests = stays.flatMap((s) => s.requests.map((r) => ({ ...r, room: s.room?.number })));
  const items: { category: string; refType: string; refId: string; summary: string }[] = [];

  for (const s of stays.filter((x) => x.status === "no_show")) {
    items.push({ category: "Khách chưa đến", refType: "stay", refId: s.id, summary: `${s.pmsCode} ${s.guestName} — P.${s.room?.number || "?"}` });
  }
  for (const s of stays.filter((x) => x.status === "inhouse" && x.registrationDueAt && !x.registrationDoneAt)) {
    items.push({ category: "Đăng ký lưu trú chưa xong", refType: "stay", refId: s.id, summary: `P.${s.room?.number} ${s.guestName}` });
  }
  for (const s of stays.filter((x) => x.status === "departing" && (!x.invoiceOk || !x.pmsCheckoutOk))) {
    items.push({ category: "Hóa đơn / thanh toán còn thiếu", refType: "stay", refId: s.id, summary: `P.${s.room?.number} chưa xác nhận PMS/hóa đơn` });
  }
  for (const s of stays) {
    for (const v of s.vehicles) {
      items.push({ category: "Khách gửi xe", refType: "vehicle", refId: v.id, summary: `P.${s.room?.number} ${v.vehicleType} ${v.plate}` });
    }
  }
  for (const r of requests.filter((x) => x.status === "open")) {
    items.push({ category: "Yêu cầu thêm chưa hoàn thành", refType: "request", refId: r.id, summary: `${r.content} (${r.kind})` });
  }
  for (const r of rooms.filter((x) => x.opsStatus === "ooo")) {
    items.push({ category: "Phòng OOO / đang sửa", refType: "room", refId: r.id, summary: `P.${r.number} ${r.oooReason || ""}` });
  }
  for (const task of tasks.filter((x) => x.zaloSent === false && ["new", "accepted", "in_progress"].includes(x.status))) {
    items.push({ category: "Công việc Zalo chưa xác nhận", refType: "task", refId: task.id, summary: task.content });
  }
  for (const task of tasks.filter((x) => x.status === "blocked")) {
    items.push({ category: "Phàn nàn và sự cố", refType: "task", refId: task.id, summary: `${task.content} — vướng: ${task.blockedReason}` });
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
  await notify({
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
