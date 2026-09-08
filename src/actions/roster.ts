"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { WEEKDAYS } from "@/lib/datetime";
import * as repo from "@/lib/repos";
import { SHIFT_TYPES, type ShiftType } from "@/lib/types";

function requireManager() {
  return requireSession().then((user) => {
    if (!can(user.role, "manageRoster")) throw new Error("Chỉ quản lý mới xếp lịch lễ tân");
    return user;
  });
}

function fail(e: unknown): never {
  redirect(`/roster?error=${encodeURIComponent((e as Error).message)}`);
}

function refresh() {
  revalidatePath("/roster");
  revalidatePath("/today");
  revalidatePath("/shifts");
  revalidatePath("/tasks/new");
}

export async function saveWeekRosterAction(formData: FormData) {
  const user = await requireManager();
  try {
    const slots = WEEKDAYS.flatMap((day) =>
      SHIFT_TYPES.map((shift) => ({
        weekday: day.iso,
        shiftType: shift,
        userId: String(formData.get(`w-${day.iso}-${shift}`) || ""),
      })),
    ).filter((slot) => slot.userId);
    await repo.saveWeekRoster(user, slots);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/roster?ok=week");
}

export async function saveTomorrowRosterAction(formData: FormData) {
  const user = await requireManager();
  const date = String(formData.get("date") || "");
  try {
    const assignments = SHIFT_TYPES.map((shift) => ({
      shiftType: shift as ShiftType,
      userId: String(formData.get(`d-${shift}`) || ""),
    })).filter((item) => item.userId);
    await repo.saveDayOverrides(user, date, assignments, String(formData.get("note") || "") || undefined);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/roster?ok=day");
}

export async function clearTomorrowRosterAction(formData: FormData) {
  const user = await requireManager();
  const date = String(formData.get("date") || "");
  try {
    await repo.clearDayOverrides(user, date);
  } catch (e) {
    fail(e);
  }
  refresh();
  redirect("/roster?ok=clear");
}
