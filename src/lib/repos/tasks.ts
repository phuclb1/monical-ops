import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { currentShiftType, nid, nowISO, shiftWindow } from "../datetime";
import { ensureTodayRoomTasks, loadChecklistByTask } from "../checklist-ops";
import { foldSearchText, sqlFolded } from "../search-text";
import { getTaskType, TASK_BOARD, type TaskBoardColumn } from "../task-types";
import type { SessionUser, TaskStatus } from "../types";
import { audit } from "./audit";
import { listUsers, usersByIds } from "./users";

function likeContains(value: string) {
  return `%${value.replace(/[%_]/g, "")}%`;
}

export async function listTasks(filter?: {
  status?: string;
  statuses?: string[];
  mine?: string;
  q?: string;
  kind?: string;
  group?: "room" | "general";
  column?: TaskBoardColumn;
}) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  const clauses: SQL[] = [];
  if (filter?.status) clauses.push(eq(t.tasks.status, filter.status));
  else if (filter?.statuses?.length) clauses.push(inArray(t.tasks.status, filter.statuses));
  else if (filter?.column) clauses.push(inArray(t.tasks.status, [...TASK_BOARD[filter.column]]));
  else clauses.push(ne(t.tasks.status, "archive"));
  if (filter?.kind) clauses.push(eq(t.tasks.kind, filter.kind));
  if (filter?.group === "room") clauses.push(isNotNull(t.tasks.roomId));
  if (filter?.group === "general") clauses.push(isNull(t.tasks.roomId));
  if (filter?.mine) clauses.push(or(eq(t.tasks.assigneeId, filter.mine), eq(t.tasks.toDept, filter.mine))!);
  if (filter?.q) {
    const like = likeContains(foldSearchText(filter.q));
    clauses.push(or(sql`${sqlFolded(sql`${t.tasks.content}`)} LIKE ${like}`, sql`${sqlFolded(sql`ifnull(${t.tasks.area}, '')`)} LIKE ${like}`)!);
  }
  return db.select().from(t.tasks).where(and(...clauses)).orderBy(desc(t.tasks.createdAt));
}

export async function getTask(id: string) {
  const db = await getDb();
  const task = (await db.select().from(t.tasks).where(eq(t.tasks.id, id)))[0];
  if (!task) return null;
  const history = await db.select().from(t.taskHistory).where(eq(t.taskHistory.taskId, id)).orderBy(desc(t.taskHistory.createdAt));
  const [users, room] = await Promise.all([
    usersByIds([task.assigneeId, task.createdBy, ...history.map((row) => row.actorId)]),
    task.roomId ? db.select().from(t.rooms).where(eq(t.rooms.id, task.roomId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
  ]);
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
