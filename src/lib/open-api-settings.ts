import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { nowISO } from "@/lib/datetime";

const TOKEN_KEY = "open_api_token";
const WEBHOOK_URL_KEY = "open_api_webhook_url";
const WEBHOOK_SECRET_KEY = "open_api_webhook_secret";

export type OpenApiPublicSettings = {
  hasToken: boolean;
  tokenHint: string;
  tokenUpdatedAt: string;
  webhookUrl: string;
  hasWebhookSecret: boolean;
};

export function generateOpenApiToken() {
  return `ops_${randomHex(32)}`;
}

export function generateWebhookSecret() {
  return `whsec_${randomHex(32)}`;
}

export function maskOpenApiToken(token: string) {
  const value = token.trim();
  if (!value) return "";
  const tail = value.slice(-4);
  const prefix = value.startsWith("ops_") ? "ops_" : "";
  return `${prefix}••••••••${tail}`;
}

export function webhookUrlError(url: string) {
  const value = url.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "URL webhook không hợp lệ.";
    return null;
  } catch {
    return "URL webhook không hợp lệ.";
  }
}

export async function loadOpenApiSettings(): Promise<OpenApiPublicSettings> {
  const values = await readOpenApiSettings();
  return {
    hasToken: Boolean(values.token),
    tokenHint: values.token ? maskOpenApiToken(values.token) : "",
    tokenUpdatedAt: values.tokenUpdatedAt,
    webhookUrl: values.webhookUrl,
    hasWebhookSecret: Boolean(values.webhookSecret),
  };
}

export async function loadOpenApiToken() {
  const values = await readOpenApiSettings();
  return values.token;
}

export async function loadOpenApiWebhookConfig() {
  const values = await readOpenApiSettings();
  return { url: values.webhookUrl, secret: values.webhookSecret };
}

export async function saveOpenApiToken(actorId: string, token: string, webhookSecret?: string) {
  const now = nowISO();
  await writeSetting(TOKEN_KEY, token, actorId, now);
  if (webhookSecret) await writeSetting(WEBHOOK_SECRET_KEY, webhookSecret, actorId, now);
}

export async function clearOpenApiToken(actorId: string) {
  const now = nowISO();
  await writeSetting(TOKEN_KEY, "", actorId, now);
}

export async function saveOpenApiWebhookUrl(actorId: string, url: string) {
  const error = webhookUrlError(url);
  if (error) throw new Error(error);
  await writeSetting(WEBHOOK_URL_KEY, url.trim(), actorId);
}

async function readOpenApiSettings() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [TOKEN_KEY, WEBHOOK_URL_KEY, WEBHOOK_SECRET_KEY]));
  const values = { token: "", webhookUrl: "", webhookSecret: "", tokenUpdatedAt: "" };
  for (const row of rows) {
    if (row.key === TOKEN_KEY) {
      values.token = row.value;
      values.tokenUpdatedAt = row.updatedAt;
    }
    if (row.key === WEBHOOK_URL_KEY) values.webhookUrl = row.value;
    if (row.key === WEBHOOK_SECRET_KEY) values.webhookSecret = row.value;
  }
  return values;
}

async function writeSetting(key: string, value: string, actorId: string, at = nowISO()) {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: at, updatedBy: actorId })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: at, updatedBy: actorId },
    });
}

function randomHex(bytes: number) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return [...raw].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
