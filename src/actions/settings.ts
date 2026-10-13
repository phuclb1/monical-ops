"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/repos";
import { receptionIpInputError, saveReceptionIpPolicy } from "@/lib/repos/access";
import {
  clearOpenApiToken,
  generateOpenApiToken,
  generateWebhookSecret,
  loadOpenApiSettings,
  maskOpenApiToken,
  saveOpenApiToken,
  saveOpenApiWebhookUrl,
  webhookUrlError,
} from "@/lib/open-api-settings";

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

export async function generateOpenApiTokenAction(
  _prev: { token?: string; webhookSecret?: string; error?: string } | null,
  _formData: FormData,
) {
  const user = await requireSession();
  if (!can(user.role, "manageSettings")) return { error: "Chỉ quản lý tạo token Open API" };
  const before = await loadOpenApiSettings();
  const token = generateOpenApiToken();
  const webhookSecret = generateWebhookSecret();
  await saveOpenApiToken(user.id, token, webhookSecret);
  await audit(user.id, "settings", "open_api_token", before.hasToken ? "update" : "create", { token: before.tokenHint }, { token: maskOpenApiToken(token) });
  return { token, webhookSecret };
}

export async function revokeOpenApiTokenAction() {
  const user = await requireSession();
  if (!can(user.role, "manageSettings")) throw new Error("Chỉ quản lý sửa cấu hình");
  const before = await loadOpenApiSettings();
  await clearOpenApiToken(user.id);
  await audit(user.id, "settings", "open_api_token", "clear", { token: before.tokenHint }, { token: "" });
  redirect("/settings/access?saved=open-api-cleared");
}

export async function saveOpenApiWebhookAction(formData: FormData) {
  const user = await requireSession();
  if (!can(user.role, "manageSettings")) throw new Error("Chỉ quản lý sửa cấu hình");
  const url = String(formData.get("webhookUrl") || "");
  const error = webhookUrlError(url);
  if (error) redirect(`/settings/access?error=${encodeURIComponent(error)}`);
  await saveOpenApiWebhookUrl(user.id, url);
  await audit(user.id, "settings", "open_api_webhook", "save", undefined, { url: url.trim() });
  redirect("/settings/access?saved=open-api-webhook");
}
