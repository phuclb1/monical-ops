"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import type { TaskStatus } from "@/lib/types";
import * as repo from "@/lib/repos";

function refresh(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

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

export async function roomStatusAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  const hkStatus = String(formData.get("hkStatus") || "");
  const opsMap: Record<string, string> = {
    waiting: "vacant_dirty",
    accepted: "vacant_dirty",
    cleaning: "cleaning",
    waiting_inspect: "waiting_inspect",
    ins: "ins",
  };
  await repo.updateRoom(user, id, {
    hkStatus: hkStatus || undefined,
    opsStatus: hkStatus ? opsMap[hkStatus] : undefined,
    assignedTo: String(formData.get("assignedTo") || "") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
  });
  refresh(["/today", "/rooms", `/rooms/${id}`]);
}

export async function reportOooAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  await repo.updateRoom(user, id, {
    opsStatus: "ooo",
    oooReason: String(formData.get("oooReason") || ""),
    oooApproved: false,
  });
  await repo.createIncident(user, {
    type: "ooo",
    roomId: id,
    location: "Phòng",
    description: String(formData.get("oooReason") || "Báo OOO"),
    severity: "high",
  });
  refresh(["/today", "/rooms", `/rooms/${id}`, "/incidents"]);
}

export async function approveOooAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  await repo.updateRoom(user, id, { oooApproved: true, opsStatus: "ooo" });
  refresh(["/rooms", `/rooms/${id}`]);
}

export async function saveRoomChecklistAction(formData: FormData) {
  const user = await requireSession();
  const roomId = String(formData.get("roomId"));
  const payload = Object.fromEntries(formData.entries());
  await repo.saveForm(user, {
    formCode: "BM-06",
    roomId,
    payload,
    signature: String(formData.get("signature") || "") || undefined,
  });
  refresh(["/rooms", `/rooms/${roomId}`, "/forms"]);
}

export async function stayPatchAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  const field = String(formData.get("field"));
  const value = formData.get("value");
  const patch: Record<string, unknown> = {};
  if (field === "pmsBookingOk") patch.pmsBookingOk = true;
  if (field === "pmsCheckinOk") patch.pmsCheckinOk = true;
  if (field === "pmsCheckoutOk") patch.pmsCheckoutOk = true;
  if (field === "invoiceOk") patch.invoiceOk = true;
  if (field === "registrationDone") {
    patch.registrationDoneAt = new Date().toISOString();
    patch.registrationReason = String(formData.get("reason") || "") || null;
  }
  if (field === "registrationReason") patch.registrationReason = String(value || "");
  if (field === "notes") patch.notes = String(formData.get("notes") || "");
  if (field === "status") patch.status = String(value || "");
  await repo.updateStay(user, id, patch);
  refresh(["/today", "/reception", `/reception/${id}`, "/handover"]);
}

export async function addVehicleAction(formData: FormData) {
  const user = await requireSession();
  const stayId = String(formData.get("stayId"));
  await repo.addVehicle(user, stayId, {
    vehicleType: String(formData.get("vehicleType")),
    plate: String(formData.get("plate")),
    location: String(formData.get("location") || ""),
    keyLocation: String(formData.get("keyLocation") || ""),
  });
  refresh([`/reception/${stayId}`, "/handover"]);
}

export async function addRequestAction(formData: FormData) {
  const user = await requireSession();
  const stayId = String(formData.get("stayId") || "");
  const mapped: Record<string, string> = { extra: "towels", early_breakfast: "general" };
  const rawKind = String(formData.get("kind") || "towels");
  const kind = mapped[rawKind] || rawKind;
  const content = String(formData.get("content"));
  const roomId = String(formData.get("roomId") || "") || undefined;
  await repo.createTask(user, {
    kind,
    stayId: stayId || undefined,
    fromDept: user.departmentCode,
    roomId,
    content,
    assigneeId: String(formData.get("assigneeId") || "") || undefined,
    dueAt: String(formData.get("dueAt") || "") || undefined,
  });
  refresh(["/today", "/reception", "/tasks", "/handover", stayId ? `/reception/${stayId}` : "/today"]);
}

export async function completeRequestAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id"));
  const stayId = String(formData.get("stayId") || "");
  await repo.completeRequest(user, id);
  refresh(["/today", "/reception", "/handover", stayId ? `/reception/${stayId}` : "/today"]);
}

export async function inspectRoomAction(formData: FormData) {
  const user = await requireSession();
  const roomId = String(formData.get("roomId"));
  const stayId = String(formData.get("stayId") || "") || undefined;
  await repo.updateRoom(user, roomId, { hkStatus: "waiting", opsStatus: "vacant_dirty" });
  await repo.createTask(user, {
    kind: "checkout_clean",
    stayId,
    fromDept: user.departmentCode,
    roomId,
    content: "Dọn phòng trả — cần INS trước khách mới",
  });
  refresh(["/rooms", "/today", "/handover", "/tasks", stayId ? `/reception/${stayId}` : "/reception"]);
}

export async function createHandoverAction(formData: FormData) {
  const user = await requireSession();
  const id = await repo.createHandover(user, String(formData.get("notes") || ""));
  refresh(["/handover", "/today", "/shifts"]);
  redirect(`/handover/${id}`);
}

export async function acceptHandoverAction(formData: FormData) {
  const user = await requireSession();
  await repo.acceptHandover(user, String(formData.get("id")));
  refresh(["/handover", "/today"]);
}

export async function breakfastAction(formData: FormData) {
  const user = await requireSession();
  const date = String(formData.get("date"));
  await repo.upsertBreakfast(user, date, {
    adults: Number(formData.get("adults") || 0),
    children: Number(formData.get("children") || 0),
    vegetarian: Number(formData.get("vegetarian") || 0),
    allergy: Number(formData.get("allergy") || 0),
    early: Number(formData.get("early") || 0),
    takeaway: Number(formData.get("takeaway") || 0),
    notes: String(formData.get("notes") || ""),
    sentBy: user.id,
    actualAdults: formData.get("actualAdults") ? Number(formData.get("actualAdults")) : undefined,
    actualChildren: formData.get("actualChildren") ? Number(formData.get("actualChildren")) : undefined,
  });
  refresh(["/kitchen", "/kitchen/forecast", "/today"]);
}

export async function confirmBreakfastAction(formData: FormData) {
  const user = await requireSession();
  await repo.confirmBreakfast(user, String(formData.get("date")));
  refresh(["/kitchen", "/kitchen/forecast", "/today"]);
}

export async function saveFormAction(formData: FormData) {
  const user = await requireSession();
  const formCode = String(formData.get("formCode"));
  const payload = Object.fromEntries(formData.entries());
  const id = await repo.saveForm(user, {
    formCode,
    payload,
    signature: String(formData.get("signature") || "") || undefined,
    roomId: String(formData.get("roomId") || "") || undefined,
    stayId: String(formData.get("stayId") || "") || undefined,
  });
  refresh(["/forms", "/reports"]);
  redirect(`/forms/${formCode}/${id}`);
}

export async function createIncidentAction(formData: FormData) {
  const user = await requireSession();
  await repo.createIncident(user, {
    type: String(formData.get("type") || "ops"),
    location: String(formData.get("location") || ""),
    roomId: String(formData.get("roomId") || "") || undefined,
    description: String(formData.get("description")),
    severity: String(formData.get("severity") || "medium"),
    photo: String(formData.get("photo") || "") || undefined,
  });
  refresh(["/incidents", "/today"]);
  redirect("/incidents");
}

export async function approveIncidentAction(formData: FormData) {
  const user = await requireSession();
  await repo.approveIncident(user, String(formData.get("id")));
  refresh(["/incidents"]);
}

export async function readNotifAction(formData: FormData) {
  const user = await requireSession();
  await repo.markNotifRead(user, String(formData.get("id")));
  refresh(["/notifications", "/today"]);
}

export async function openNotifAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id") || "");
  const link = String(formData.get("link") || "/notifications");
  if (id) await repo.markNotifRead(user, id);
  refresh(["/notifications", "/today"]);
  if (link.startsWith("/") && !link.startsWith("//")) redirect(link);
}

export async function readAllNotifAction() {
  const user = await requireSession();
  await repo.markAllNotifRead(user);
  refresh(["/notifications", "/today"]);
}
