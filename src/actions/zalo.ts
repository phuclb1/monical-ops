"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/repos";
import { listZaloGroups, rememberZaloGroup, sendZaloToGroup } from "@/lib/zalo-client";
import { clearZaloLogin, loadZaloMessages, loadZaloPublicStatus, saveZaloChannel, saveZaloGroupSlot, saveZaloMessage, saveZaloPhone, zaloChannel } from "@/lib/zalo-session";
import { normalizeZaloPhone, zaloPhoneError } from "@/lib/zalo";
import { sendChannelPreview, sendMessagePreview, sendReceptionZalo } from "@/lib/zalo-notify";
import { isZaloChannelKey, zaloChannelDef } from "@/lib/zalo-templates";
import { isZaloGroupSlot, isZaloMessageId, isZaloTime, ZALO_MESSAGE_DEFS } from "@/lib/zalo-messages";
import type { ZaloGroupOption } from "@/lib/zalo-client";

function zaloBack(tab: "groups" | "messages", params: Record<string, string>) {
  return `/settings/zalo?${new URLSearchParams({ tab, ...params })}`;
}

async function requireManager() {
  const user = await requireSession();
  if (!can(user.role, "manageSettings")) throw new Error("Chỉ quản lý sửa Zalo");
  return user;
}

export async function saveZaloPhoneAction(formData: FormData) {
  const user = await requireManager();
  const phone = String(formData.get("phone") || "");
  const error = zaloPhoneError(phone);
  if (error) redirect(`/settings/zalo?error=${encodeURIComponent(error)}`);
  const before = await loadZaloPublicStatus();
  const next = normalizeZaloPhone(phone);
  await saveZaloPhone(user.id, next);
  if (before.phone && before.phone !== next) await clearZaloLogin(user.id);
  await audit(user.id, "settings", "zalo_phone", "save", { phone: before.phone }, { phone: next });
  redirect("/settings/zalo?saved=phone");
}

export async function listZaloGroupsAction(): Promise<{ ok: true; groups: ZaloGroupOption[] } | { ok: false; error: string }> {
  try {
    const user = await requireManager();
    const groups = await listZaloGroups(user.id);
    return { ok: true, groups };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không tải được nhóm Zalo." };
  }
}

export async function saveZaloGroupSlotAction(formData: FormData) {
  const user = await requireManager();
  const slot = String(formData.get("slot") || "");
  if (!isZaloGroupSlot(slot)) redirect(zaloBack("groups", { error: "Không có nhóm này." }));
  const groupId = String(formData.get("groupId") || "");
  let groupName = "";
  if (groupId) {
    if (!/^\d+$/.test(groupId)) redirect(zaloBack("groups", { error: "Chọn một nhóm Zalo." }));
    try {
      groupName = (await rememberZaloGroup(user.id, groupId)).name;
    } catch (error) {
      redirect(zaloBack("groups", { error: error instanceof Error ? error.message : "Không lưu được nhóm." }));
    }
  }
  await saveZaloGroupSlot(user.id, { slot, groupId, groupName });
  await audit(user.id, "settings", "zalo_group", "save", undefined, { slot, groupId, groupName });
  redirect(zaloBack("groups", { saved: slot }));
}

export async function saveZaloMessageAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id") || "");
  if (!isZaloMessageId(id)) redirect(zaloBack("messages", { error: "Không có tin này." }));
  const def = ZALO_MESSAGE_DEFS.find((item) => item.id === id);
  if (!def) redirect(zaloBack("messages", { error: "Không có tin này." }));
  const group = String(formData.get("group") || "");
  if (!isZaloGroupSlot(group)) redirect(zaloBack("messages", { error: "Chọn nhóm nhận tin." }));
  const template = String(formData.get("template") || "").trim();
  if (!template) redirect(zaloBack("messages", { error: "Nhập mẫu tin." }));
  if (template.length > 2000) redirect(zaloBack("messages", { error: "Mẫu tin dài quá 2000 ký tự." }));
  const fallbackTime = def.kind === "schedule" && "time" in def ? def.time : "07:00";
  const time = String(formData.get("time") || fallbackTime);
  if (def.kind === "schedule" && !isZaloTime(time)) redirect(zaloBack("messages", { error: "Chọn giờ gửi trong ngày." }));
  const current = (await loadZaloMessages()).find((item) => item.id === id);
  await saveZaloMessage(user.id, {
    id,
    name: def.name,
    enabled: formData.get("enabled") === "on",
    group,
    template,
    kind: def.kind,
    time: def.kind === "schedule" ? time : current?.time || "07:00",
    event: def.kind === "trigger" ? def.event : "",
    lastSentOn: current?.lastSentOn || "",
  });
  await audit(user.id, "settings", "zalo_message", "save", undefined, { id, group, kind: def.kind, time });
  redirect(zaloBack("messages", { saved: id }));
}

export async function sendZaloMessageTestAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id") || "");
  if (!isZaloMessageId(id)) redirect(zaloBack("messages", { error: "Không có tin này." }));
  try {
    const result = await sendMessagePreview(user.id, id);
    await audit(user.id, "settings", "zalo_test", "send", undefined, { id, groupId: result.groupId });
  } catch (error) {
    redirect(zaloBack("messages", { error: error instanceof Error ? error.message : "Không gửi được tin thử." }));
  }
  redirect(zaloBack("messages", { saved: "test" }));
}

export async function saveZaloChannelAction(formData: FormData) {
  const user = await requireManager();
  const key = String(formData.get("key") || "");
  if (!isZaloChannelKey(key)) redirect(`/settings/zalo?error=${encodeURIComponent("Không có loại thông báo này.")}`);
  const template = String(formData.get("template") || "").trim();
  if (!template) redirect(`/settings/zalo?error=${encodeURIComponent("Nhập mẫu tin.")}`);
  if (template.length > 2000) redirect(`/settings/zalo?error=${encodeURIComponent("Mẫu tin dài quá 2000 ký tự.")}`);
  const groupId = String(formData.get("groupId") || "");
  let groupName = "";
  if (groupId) {
    if (!/^\d+$/.test(groupId)) redirect(`/settings/zalo?error=${encodeURIComponent("Chọn một nhóm Zalo.")}`);
    try {
      const group = await rememberZaloGroup(user.id, groupId);
      groupName = group.name;
    } catch (error) {
      redirect(`/settings/zalo?error=${encodeURIComponent(error instanceof Error ? error.message : "Không lưu được nhóm.")}`);
    }
  }
  await saveZaloChannel(user.id, { key, groupId, groupName, template });
  await audit(user.id, "settings", "zalo_channel", "save", undefined, { key, groupId, groupName, label: zaloChannelDef(key).label });
  redirect(`/settings/zalo?saved=${key}`);
}

export async function sendReceptionZaloAction() {
  const user = await requireManager();
  try {
    const channel = await zaloChannel("reception");
    if (!channel.groupId) redirect(`/settings/zalo?error=${encodeURIComponent("Chọn nhóm lễ tân trước khi gửi.")}`);
    const result = await sendReceptionZalo(user.id);
    if (!result.sent) redirect(`/settings/zalo?error=${encodeURIComponent("Chưa gửi được bản tin lễ tân.")}`);
    await audit(user.id, "settings", "zalo_reception", "send", undefined, { groupId: channel.groupId });
  } catch (error) {
    redirect(`/settings/zalo?error=${encodeURIComponent(error instanceof Error ? error.message : "Không gửi được bản tin lễ tân.")}`);
  }
  redirect("/settings/zalo?saved=reception-sent");
}

export async function sendZaloTestAction(formData: FormData) {
  const user = await requireManager();
  const groupId = String(formData.get("groupId") || "");
  const message = String(formData.get("message") || "").trim();
  if (!/^\d+$/.test(groupId)) redirect(`/settings/zalo?error=${encodeURIComponent("Chọn nhóm để gửi thử.")}`);
  if (!message) redirect(`/settings/zalo?error=${encodeURIComponent("Nhập nội dung tin thử.")}`);
  if (message.length > 2000) redirect(`/settings/zalo?error=${encodeURIComponent("Tin thử dài quá 2000 ký tự.")}`);
  try {
    await sendZaloToGroup(user.id, groupId, message);
    await audit(user.id, "settings", "zalo_test", "send", undefined, { groupId });
  } catch (error) {
    redirect(`/settings/zalo?error=${encodeURIComponent(error instanceof Error ? error.message : "Không gửi được tin thử.")}`);
  }
  redirect("/settings/zalo?saved=test");
}

export async function sendZaloTemplateTestAction(formData: FormData) {
  const user = await requireManager();
  const key = String(formData.get("key") || "");
  if (!isZaloChannelKey(key)) redirect(`/settings/zalo?error=${encodeURIComponent("Không có loại thông báo này.")}`);
  try {
    const result = await sendChannelPreview(user.id, key);
    if (!result.sent) redirect(`/settings/zalo?error=${encodeURIComponent(`Chọn ${zaloChannelDef(key).label.toLowerCase()} trước khi gửi thử.`)}`);
    await audit(user.id, "settings", "zalo_test", "send", undefined, { key, groupId: result.channel.groupId });
  } catch (error) {
    redirect(`/settings/zalo?error=${encodeURIComponent(error instanceof Error ? error.message : "Không gửi được tin thử.")}`);
  }
  redirect("/settings/zalo?saved=test");
}

export async function disconnectZaloAction() {
  const user = await requireManager();
  await clearZaloLogin(user.id);
  await audit(user.id, "settings", "zalo_session", "clear", undefined, { cleared: true });
  redirect("/settings/zalo?saved=cleared");
}
