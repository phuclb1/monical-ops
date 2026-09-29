"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/repos";
import { listZaloGroups, rememberZaloGroup } from "@/lib/zalo-client";
import { clearZaloLogin, loadZaloPublicStatus, saveZaloGroup, saveZaloPhone } from "@/lib/zalo-session";
import { normalizeZaloPhone, zaloPhoneError } from "@/lib/zalo";
import type { ZaloGroupOption } from "@/lib/zalo-client";

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

export async function saveZaloGroupAction(formData: FormData) {
  const user = await requireManager();
  const groupId = String(formData.get("groupId") || "");
  if (!/^\d+$/.test(groupId)) redirect(`/settings/zalo?error=${encodeURIComponent("Chọn một nhóm Zalo.")}`);
  try {
    const group = await rememberZaloGroup(user.id, groupId);
    await saveZaloGroup(user.id, group.id, group.name);
    await audit(user.id, "settings", "zalo_group", "save", undefined, { groupId: group.id, groupName: group.name });
  } catch (error) {
    redirect(`/settings/zalo?error=${encodeURIComponent(error instanceof Error ? error.message : "Không lưu được nhóm.")}`);
  }
  redirect("/settings/zalo?saved=group");
}

export async function disconnectZaloAction() {
  const user = await requireManager();
  await clearZaloLogin(user.id);
  await audit(user.id, "settings", "zalo_session", "clear", undefined, { cleared: true });
  redirect("/settings/zalo?saved=cleared");
}
