"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import type { TaskStatus } from "@/lib/types";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

export async function createTaskAction(formData: FormData) {
  const user = await requireSession();
  const stayId = String(formData.get("stayId") || "") || undefined;
  const returnTo = String(formData.get("returnTo") || "");
  let id: string;
  try {
    id = await repo.createTask(user, {
      kind: String(formData.get("kind") || "general"),
      stayId,
      fromDept: String(formData.get("fromDept") || user.departmentCode),
      toDept: String(formData.get("toDept") || "") || undefined,
      roomId: String(formData.get("roomId") || "") || undefined,
      area: String(formData.get("area") || "") || undefined,
      content: String(formData.get("content")),
      priority: String(formData.get("priority") || "") || undefined,
      assigneeId: String(formData.get("assigneeId") || "") || undefined,
      dueAt: String(formData.get("dueAt") || "") || undefined,
      formCode: "BM-13",
      photo: String(formData.get("photo") || "") || undefined,
    });
  } catch (e) {
    redirect(`/tasks/new?error=${encodeURIComponent((e as Error).message)}`);
  }
  refresh(["/today", "/tasks", "/handover", stayId ? `/reception/${stayId}` : "/reception"]);
  if (returnTo === "stay" && stayId) redirect(`/reception/${stayId}`);
  redirect(`/tasks/${id}`);
}

export async function taskStatusAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  try {
    await repo.updateTaskStatus(user, id, String(formData.get("status")) as TaskStatus, String(formData.get("note") || "") || undefined, {
      reason: String(formData.get("blockedReason") || ""),
      action: String(formData.get("blockedAction") || ""),
    });
  } catch (e) {
    redirect(`/tasks/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  refresh(["/today", "/tasks", `/tasks/${id}`, "/handover"]);
}

export async function zaloSentAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  await repo.markZaloSent(user, id);
  refresh([`/tasks/${id}`, "/handover"]);
}
