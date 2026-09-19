import { and, eq } from "drizzle-orm";
import { insertInBatches } from "@/db/batch";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nextDate, nowISO, todayVN, weekdayISO } from "../datetime";
import { dayOverrideId, rosterVersionOf, weekSlotId } from "../roster";
import type { SessionUser, ShiftType } from "../types";
import { audit } from "./audit";
import { listUsers } from "./users";

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
