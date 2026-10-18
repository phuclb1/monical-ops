import { cache } from "react";
import { and, eq, inArray, isNotNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { visibleNotifications } from "@/modules/notifications/models/notifications";
import { addDaysVN, currentShiftType, nextDate, nowISO, shiftWindow, todayVN } from "../datetime";
import { ensureShiftChecklists } from "../checklist-ops";
import type { SessionUser, ShiftType } from "../types";
import { pendingHandover } from "./handovers";
import { receptionDuty, receptionDutyDay } from "./roster";
import { currentOpenShift, getShiftBundle } from "./shifts";
import { stayBoardStatus } from "../stay-checklist";

const OPEN_TASK_STATUSES = ["new", "accepted", "in_progress", "blocked"] as const;

export const getDashboard = cache(async (user: SessionUser) => {
  const db = await getDb();
  const today = todayVN();
  const shift = await currentOpenShift();
  if (shift) await ensureShiftChecklists(db, shift, { actorId: user.id });
  const shiftType = (shift?.type as ShiftType) || currentShiftType();
  const [rooms, stays, openRequests, breakfast, handover, unreadRows, tasks, duty, tomorrowDuty, bundle] = await Promise.all([
    db.select().from(t.rooms),
    db.select().from(t.stays).where(ne(t.stays.status, "departed")),
    db.select().from(t.guestRequests).where(eq(t.guestRequests.status, "open")),
    db.select().from(t.breakfasts).where(eq(t.breakfasts.date, addDaysVN(today, 1))).limit(1).then((rows) => rows[0]),
    pendingHandover(),
    db
      .select({ n: sql<number>`count(*)` })
      .from(t.notifications)
      .where(and(visibleNotifications(user), eq(t.notifications.read, false))),
    db
      .select()
      .from(t.tasks)
      .where(
        or(
          inArray(t.tasks.status, [...OPEN_TASK_STATUSES]),
          and(isNotNull(t.tasks.dueAt), lt(t.tasks.dueAt, nowISO()), notInArray(t.tasks.status, ["done", "checked"])),
        ),
      ),
    receptionDuty(today, shiftType),
    receptionDutyDay(nextDate(today)),
    shift ? getShiftBundle(shift.id, user.role === "manager" ? undefined : user.departmentCode) : Promise.resolve(null),
  ]);

  const now = Date.now();
  return {
    shift,
    handover,
    rooms,
    stays,
    breakfast,
    unread: Number(unreadRows[0]?.n ?? 0),
    nowTasks: tasks.filter((x) => OPEN_TASK_STATUSES.includes(x.status as (typeof OPEN_TASK_STATUSES)[number])),
    overdueTasks: tasks.filter((x) => x.dueAt && new Date(x.dueAt).getTime() < now && !["done", "checked"].includes(x.status)),
    arriving: stays.filter((s) => stayBoardStatus(s, today) === "arriving" && s.arrivalDate <= today),
    departing: stays.filter((s) => stayBoardStatus(s, today) === "departing"),
    noShow: stays.filter((s) => s.status === "no_show"),
    cleaning: rooms.filter((r) => r.hkStatus === "cleaning" || r.opsStatus === "cleaning"),
    ins: rooms.filter((r) => r.hkStatus === "ins" || r.opsStatus === "ins"),
    ooo: rooms.filter((r) => r.opsStatus === "ooo"),
    openRequests,
    shiftEnd: shift ? shiftWindow(shift.type as ShiftType, shift.date).end : null,
    duty,
    tomorrowDuty,
    shiftLists: (bundle?.checklists ?? []).slice().sort((a) => (a.kind === "shift_open" ? -1 : 1)),
  };
});
