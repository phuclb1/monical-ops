"use server";

import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

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
