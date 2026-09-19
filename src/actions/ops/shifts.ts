"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

export async function openShiftAction() {
  const user = await requireSession();
  await repo.openShift(user);
  refresh(["/today", "/shifts"]);
}

export async function closeShiftAction(formData: FormData) {
  const user = await requireSession();
  const reason = String(formData.get("reason") || "");
  try {
    await repo.closeShift(user, reason || undefined);
  } catch (e) {
    redirect(`/shifts?error=${encodeURIComponent((e as Error).message)}`);
  }
  refresh(["/today", "/shifts", "/handover"]);
  redirect("/today");
}

export async function toggleCheckAction(formData: FormData) {
  const user = await requireSession();
  await repo.toggleChecklistItem(user, String(formData.get("itemId")));
  refresh(["/today", "/shifts", "/tasks", "/reception", "/handover"]);
  revalidatePath("/tasks", "layout");
  revalidatePath("/reception", "layout");
}

export async function skipCheckAction(formData: FormData) {
  const user = await requireSession();
  await repo.skipChecklistItem(user, String(formData.get("itemId")), String(formData.get("reason") || ""));
  refresh(["/today", "/shifts", "/tasks", "/reception", "/handover"]);
  revalidatePath("/tasks", "layout");
  revalidatePath("/reception", "layout");
}

export async function saveCheckItemAction(formData: FormData) {
  const user = await requireSession();
  await repo.saveChecklistItem(user, String(formData.get("itemId")), {
    note: String(formData.get("note") || ""),
    photo: String(formData.get("photo") || ""),
    skipReason: String(formData.get("reason") || "") || undefined,
  });
  refresh(["/today", "/shifts", "/tasks", "/reception", "/handover"]);
  revalidatePath("/tasks", "layout");
  revalidatePath("/reception", "layout");
}
