import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { currentShiftType, nid, nowISO, shiftWindow } from "../datetime";
import { ensureTodayRoomTasks, loadChecklistByTask } from "../checklist-ops";
import { getTaskType, taskBoardColumn, type TaskBoardColumn } from "../task-types";
import type { SessionUser, TaskStatus } from "../types";
import { audit } from "./audit";
import { listUsers } from "./users";

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
