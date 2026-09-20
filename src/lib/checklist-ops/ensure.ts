import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO, shiftWindow, todayVN, weekdayISO } from "../datetime";
import { CHECKLIST_KIND_LABEL, checklistTemplate, type ChecklistKind } from "../checklists";
import { rosterVersionOf } from "../roster";
import { SHIFT_LABEL } from "../constants";
import { getTaskType } from "../task-types";
import type { ShiftType } from "../types";
import type { ChecklistActor } from "./types";

type ShiftRow = typeof t.shifts.$inferSelect;

async function morningAssignee(db: AppDb, date: string) {
  const override = (
    await db
      .select()
      .from(t.receptionDayOverrides)
      .where(and(eq(t.receptionDayOverrides.date, date), eq(t.receptionDayOverrides.shiftType, "morning")))
      .limit(1)
  )[0];
  if (override) return override.userId;
  const slots = await db
    .select()
    .from(t.receptionWeekSlots)
    .where(and(eq(t.receptionWeekSlots.weekday, weekdayISO(date)), eq(t.receptionWeekSlots.shiftType, "morning")));
  return rosterVersionOf(slots, date).slots[0]?.userId ?? null;
}

async function shiftAssignee(db: AppDb, date: string, shiftType: ShiftType) {
  const override = (
    await db
      .select()
      .from(t.receptionDayOverrides)
      .where(and(eq(t.receptionDayOverrides.date, date), eq(t.receptionDayOverrides.shiftType, shiftType)))
      .limit(1)
  )[0];
  if (override) return override.userId;
  const slots = await db
    .select()
    .from(t.receptionWeekSlots)
    .where(and(eq(t.receptionWeekSlots.weekday, weekdayISO(date)), eq(t.receptionWeekSlots.shiftType, shiftType)));
  return rosterVersionOf(slots, date).slots[0]?.userId ?? null;
}

async function insertTask(
  db: AppDb,
  input: {
    kind: string;
    content: string;
    stayId?: string | null;
    roomId?: string | null;
    area?: string | null;
    fromDept: string;
    toDept: string;
    dueAt: string | null;
    actorId: string;
    assigneeId?: string | null;
    note: string;
  },
) {
  const now = nowISO();
  const taskId = nid();
  const type = getTaskType(input.kind);
  await db.insert(t.tasks).values({
    id: taskId,
    kind: input.kind,
    stayId: input.stayId || null,
    fromDept: input.fromDept,
    toDept: input.toDept,
    roomId: input.roomId || null,
    area: input.area || null,
    content: input.content,
    priority: type.priority,
    assigneeId: input.assigneeId || null,
    dueAt: input.dueAt,
    formCode: null,
    status: "new",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: null,
    zaloSent: false,
    zaloSentAt: null,
    photo: null,
    createdBy: input.actorId,
    createdAt: now,
    updatedBy: input.actorId,
    updatedAt: now,
  });
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId,
    fromStatus: null,
    toStatus: "new",
    actorId: input.actorId,
    note: input.note,
    createdAt: now,
  });
  return taskId;
}

async function insertBundle(
  db: AppDb,
  input: {
    kind: ChecklistKind;
    title: string;
    content: string;
    date: string;
    shiftId?: string | null;
    stayId?: string | null;
    roomId?: string | null;
    dueAt: string | null;
    actorId: string;
    assigneeId?: string | null;
    shiftType?: ShiftType;
  },
) {
  const taskId = await insertTask(db, {
    kind: input.kind,
    content: input.content,
    stayId: input.stayId,
    roomId: input.roomId,
    area: input.kind === "shift_open" || input.kind === "shift_close" ? "Quầy lễ tân" : null,
    fromDept: "reception",
    toDept: "reception",
    dueAt: input.dueAt,
    actorId: input.actorId,
    assigneeId: input.assigneeId,
    note: `Tự tạo ${CHECKLIST_KIND_LABEL[input.kind]}`,
  });
  const checklistId = nid();
  await db.insert(t.checklists).values({
    id: checklistId,
    kind: input.kind,
    shiftId: input.shiftId || "none",
    stayId: input.stayId || null,
    roomId: input.roomId || null,
    taskId,
    date: input.date,
    departmentCode: "reception",
    title: input.title,
  });
  const items = checklistTemplate(input.kind, input.shiftType);
  if (items.length) {
    await db.insert(t.checklistItems).values(
      items.map((item, i) => ({
        id: nid(),
        checklistId,
        itemKey: item.key,
        label: item.label,
        required: item.required,
        done: false,
        doneBy: null,
        doneAt: null,
        skipReason: null,
        note: null,
        photo: null,
        sortOrder: i,
      })),
    );
  }
  return { taskId, checklistId };
}

export async function ensureShiftChecklists(db: AppDb, shift: ShiftRow, actor: ChecklistActor) {
  const lists = await db.select().from(t.checklists).where(eq(t.checklists.shiftId, shift.id));
  const ready = lists.filter((row) => row.taskId && (row.kind === "shift_open" || row.kind === "shift_close"));
  if (ready.some((row) => row.kind === "shift_open") && ready.some((row) => row.kind === "shift_close")) return;

  const stale = lists.filter((row) => row.kind !== "checkin" && row.kind !== "checkout" && !row.taskId);
  for (const row of stale) {
    await db.delete(t.checklistItems).where(eq(t.checklistItems.checklistId, row.id));
    await db.delete(t.checklists).where(eq(t.checklists.id, row.id));
  }

  const shiftType = shift.type as ShiftType;
  const assigneeId = actor.assigneeId || (await shiftAssignee(db, shift.date, shiftType)) || actor.actorId;
  const dueAt = shiftWindow(shiftType, shift.date).end;
  const label = SHIFT_LABEL[shiftType];

  if (!ready.some((row) => row.kind === "shift_open")) {
    await insertBundle(db, {
      kind: "shift_open",
      title: `Đầu ca — ${label}`,
      content: `Đầu ca — ${label}`,
      date: shift.date,
      shiftId: shift.id,
      dueAt,
      actorId: actor.actorId,
      assigneeId,
      shiftType,
    });
  }
  if (!ready.some((row) => row.kind === "shift_close")) {
    await insertBundle(db, {
      kind: "shift_close",
      title: `Cuối ca — ${label}`,
      content: `Cuối ca — ${label}`,
      date: shift.date,
      shiftId: shift.id,
      dueAt,
      actorId: actor.actorId,
      assigneeId,
      shiftType,
    });
  }
}

export async function spawnRoomChecklist(
  db: AppDb,
  input: {
    kind: "checkin" | "checkout";
    guestName: string;
    roomNumber: string;
    roomId: string;
    stayId?: string | null;
    actorId: string;
    date?: string;
  },
) {
  const date = input.date || todayVN();
  const lists = await db.select().from(t.checklists);
  const exists = lists.some((row) => row.kind === input.kind && row.roomId === input.roomId && row.date === date);
  if (exists) return null;
  const verb = input.kind === "checkin" ? "Nhận" : "Trả";
  const assigneeId = await morningAssignee(db, date);
  return insertBundle(db, {
    kind: input.kind,
    title: `${CHECKLIST_KIND_LABEL[input.kind]} P.${input.roomNumber}`,
    content: `${verb} P.${input.roomNumber} — ${input.guestName}`,
    date,
    stayId: input.stayId,
    roomId: input.roomId,
    dueAt: shiftWindow("morning", date).end,
    actorId: input.actorId,
    assigneeId,
  });
}

export async function ensureTodayRoomTasks(_db: AppDb, _actor: ChecklistActor, _date = todayVN()) {
  return;
}
