"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/repos";
import { receptionIpInputError, saveReceptionIpPolicy } from "@/lib/repos/access";

export async function saveAccessSettingsAction(formData: FormData) {
  const user = await requireSession();
  if (!can(user.role, "manageSettings")) throw new Error("Chỉ quản lý sửa cấu hình");
  const enabled = formData.get("restrict") === "on";
  const ip = String(formData.get("ip") || "");
  const error = receptionIpInputError(enabled, ip);
  if (error) redirect(`/settings/access?error=${encodeURIComponent(error)}`);
  await saveReceptionIpPolicy(user.id, enabled, ip);
  await audit(user.id, "settings", "reception_ip", "save", undefined, { enabled, ip: ip.trim() });
  redirect("/settings/access?saved=1");
}
