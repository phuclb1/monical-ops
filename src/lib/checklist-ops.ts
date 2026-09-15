import { and, eq } from "drizzle-orm";
import type { AppDb } from "./db";
import * as t from "./db/schema";
import { nid, nowISO, shiftWindow, todayVN, weekdayISO } from "./datetime";
import { CHECKLIST_KIND_LABEL, checklistTemplate, isChecklistKind, type ChecklistKind } from "./checklists";
import { rosterVersionOf } from "./roster";
import { isActiveSaleStatus } from "./sales";
import { SHIFT_LABEL } from "./constants";
import type { ShiftType } from "./types";

export type ChecklistActor = { actorId: string; assigneeId?: string | null };

type ShiftRow = typeof t.shifts.$inferSelect;
type ChecklistRow = typeof t.checklists.$inferSelect;
type ItemRow = typeof t.checklistItems.$inferSelect;

export type ChecklistBundle = ChecklistRow & { items: ItemRow[] };

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
  const now = nowISO();
  const taskId = nid();
  const checklistId = nid();
  await db.insert(t.tasks).values({
    id: taskId,
    kind: input.kind,
    stayId: input.stayId || null,
    fromDept: "reception",
    toDept: "reception",
    roomId: input.roomId || null,
    area: input.kind === "shift_open" || input.kind === "shift_close" ? "Quầy lễ tân" : null,
    content: input.content,
    priority: "priority",
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
    note: `Tự tạo ${CHECKLIST_KIND_LABEL[input.kind]}`,
    createdAt: now,
  });
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

type RoomJob = {
  kind: "checkin" | "checkout";
  roomId: string;
  stayId?: string | null;
  guestName: string;
  roomNumber: string;
};

export async function ensureTodayRoomTasks(db: AppDb, actor: ChecklistActor, date = todayVN()) {
  const [stays, sales, rooms, lists] = await Promise.all([
    db.select().from(t.stays),
    db.select().from(t.roomSales),
    db.select().from(t.rooms),
    db.select().from(t.checklists),
  ]);
  const roomOf = new Map(rooms.map((room) => [room.id, room]));
  const existing = new Set(
    lists
      .filter((row) => row.date === date && (row.kind === "checkin" || row.kind === "checkout") && row.roomId)
      .map((row) => `${row.kind}:${row.roomId}`),
  );

  const jobs = new Map<string, RoomJob>();
  const put = (job: RoomJob) => {
    const key = `${job.kind}:${job.roomId}`;
    if (existing.has(key) || jobs.has(key)) return;
    jobs.set(key, job);
  };

  for (const stay of stays) {
    if (!stay.roomId) continue;
    const room = roomOf.get(stay.roomId);
    if (!room) continue;
    if (stay.arrivalDate === date && (stay.status === "arriving" || stay.status === "no_show")) {
      put({ kind: "checkin", roomId: stay.roomId, stayId: stay.id, guestName: stay.guestName, roomNumber: room.number });
    }
    if (stay.departureDate === date && (stay.status === "inhouse" || stay.status === "departing")) {
      put({ kind: "checkout", roomId: stay.roomId, stayId: stay.id, guestName: stay.guestName, roomNumber: room.number });
    }
  }

  for (const sale of sales) {
    if (!isActiveSaleStatus(sale.status)) continue;
    const room = roomOf.get(sale.roomId);
    if (!room) continue;
    const stay = stays.find((row) => row.pmsCode && row.pmsCode === sale.pmsCode) ?? stays.find((row) => row.roomId === sale.roomId && row.guestName === sale.guestName);
    if (sale.status === "reserved" && sale.checkIn === date) {
      put({
        kind: "checkin",
        roomId: sale.roomId,
        stayId: stay?.id || null,
        guestName: sale.guestName,
        roomNumber: room.number,
      });
    }
    if (sale.status === "inhouse" && sale.checkOut === date) {
      put({
        kind: "checkout",
        roomId: sale.roomId,
        stayId: stay?.id || null,
        guestName: sale.guestName,
        roomNumber: room.number,
      });
    }
  }

  if (!jobs.size) return;
  const assigneeId = actor.assigneeId || (await morningAssignee(db, date));
  const dueAt = shiftWindow("morning", date).end;
  const actorId = actor.actorId || assigneeId || "u-quanly";

  for (const job of jobs.values()) {
    const verb = job.kind === "checkin" ? "Nhận" : "Trả";
    await insertBundle(db, {
      kind: job.kind,
      title: `${CHECKLIST_KIND_LABEL[job.kind]} P.${job.roomNumber}`,
      content: `${verb} P.${job.roomNumber} — ${job.guestName}`,
      date,
      stayId: job.stayId,
      roomId: job.roomId,
      dueAt,
      actorId,
      assigneeId,
    });
  }
}

export async function loadChecklistByTask(db: AppDb, taskId: string): Promise<ChecklistBundle | null> {
  const list = (await db.select().from(t.checklists).where(eq(t.checklists.taskId, taskId)).limit(1))[0];
  if (!list) return null;
  const items = (await db.select().from(t.checklistItems).where(eq(t.checklistItems.checklistId, list.id))).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  return { ...list, items };
}

export async function loadChecklistsForStay(db: AppDb, stayId: string): Promise<ChecklistBundle[]> {
  const lists = await db.select().from(t.checklists).where(eq(t.checklists.stayId, stayId));
  const items = await db.select().from(t.checklistItems);
  return lists
    .filter((row) => isChecklistKind(row.kind))
    .map((list) => ({
      ...list,
      items: items.filter((item) => item.checklistId === list.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => Number(a.kind === "checkout") - Number(b.kind === "checkout"));
}

export async function loadChecklistsForRoom(db: AppDb, roomId: string, date = todayVN()): Promise<ChecklistBundle[]> {
  const lists = (await db.select().from(t.checklists).where(eq(t.checklists.roomId, roomId))).filter(
    (row) => row.date === date && (row.kind === "checkin" || row.kind === "checkout"),
  );
  const items = await db.select().from(t.checklistItems);
  return lists.map((list) => ({
    ...list,
    items: items.filter((item) => item.checklistId === list.id).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function requiredPending(items: { required: boolean; done: boolean; skipReason: string | null }[]) {
  return items.filter((item) => item.required && !item.done && !item.skipReason);
}
