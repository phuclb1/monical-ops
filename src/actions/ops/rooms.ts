"use server";

import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

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
