import { cache } from "react";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { currentShiftType, nid, nowISO, todayVN } from "../datetime";
import { ensureShiftChecklists, ensureTodayRoomTasks } from "../checklist-ops";
import type { SessionUser, ShiftType } from "../types";
import { audit } from "./audit";

export const currentOpenShift = cache(async () => {
  const db = await getDb();
  const rows = await db.select().from(t.shifts).where(eq(t.shifts.status, "open")).orderBy(desc(t.shifts.openedAt)).limit(1);
  return rows[0] ?? null;
});

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
