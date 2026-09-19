import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { visibleNotifications } from "@/modules/notifications/models/notifications";
import { addDaysVN, currentShiftType, nextDate, shiftWindow, todayVN } from "../datetime";
import { ensureShiftChecklists, ensureTodayRoomTasks } from "../checklist-ops";
import type { SessionUser, ShiftType } from "../types";
import { pendingHandover } from "./handovers";
import { receptionDuty, receptionDutyDay } from "./roster";
import { currentOpenShift } from "./shifts";

export const getDashboard = cache(async (user: SessionUser) => {
  const db = await getDb();
  const today = todayVN();
  const shift = await currentOpenShift();
  const rooms = await db.select().from(t.rooms);
  const stays = await db.select().from(t.stays);
  const requests = await db.select().from(t.guestRequests);
  const breakfast = (
    await db.select().from(t.breakfasts).where(eq(t.breakfasts.date, addDaysVN(today, 1))).limit(1)
  )[0];
  const handover = await pendingHandover();
  const unreadRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(t.notifications)
    .where(and(visibleNotifications(user), eq(t.notifications.read, false)));
  const unreadCount = Number(unreadRows[0]?.n ?? 0);

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
    unread: unreadCount,
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
});
