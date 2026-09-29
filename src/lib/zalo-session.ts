import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { nowISO } from "@/lib/datetime";
import { cookieDeadline, normalizeZaloPhone } from "@/lib/zalo";

const PHONE = "zalo_sender_phone";
const CREDENTIALS = "zalo_credentials";
const ACCOUNT_NAME = "zalo_account_name";
const ACCOUNT_UID = "zalo_account_uid";
const ACCOUNT_PHONE = "zalo_account_phone";
const GROUP_ID = "zalo_group_id";
const GROUP_NAME = "zalo_group_name";
const SAVED_AT = "zalo_session_saved_at";

const SESSION_KEYS = [PHONE, CREDENTIALS, ACCOUNT_NAME, ACCOUNT_UID, ACCOUNT_PHONE, GROUP_ID, GROUP_NAME, SAVED_AT];

export type ZaloCredentials = {
  imei: string;
  userAgent: string;
  language: string;
  cookies: unknown[];
};

export type ZaloPublicStatus = {
  phone: string;
  connected: boolean;
  accountName: string;
  accountPhone: string;
  groupId: string;
  groupName: string;
  savedAt: string;
  encryptUntil: string | null;
  loginUntil: string | null;
};

export async function loadZaloPublicStatus(): Promise<ZaloPublicStatus> {
  const values = await readKeys();
  const credentials = parseCredentials(values[CREDENTIALS]);
  const deadline = cookieDeadline(credentials?.cookies);
  return {
    phone: values[PHONE] || "",
    connected: Boolean(credentials),
    accountName: values[ACCOUNT_NAME] || "",
    accountPhone: values[ACCOUNT_PHONE] || "",
    groupId: values[GROUP_ID] || "",
    groupName: values[GROUP_NAME] || "",
    savedAt: values[SAVED_AT] || "",
    encryptUntil: deadline.encryptUntil,
    loginUntil: deadline.loginUntil,
  };
}

export async function loadZaloCredentials() {
  const values = await readKeys();
  const credentials = parseCredentials(values[CREDENTIALS]);
  if (!credentials) return null;
  return {
    credentials,
    phone: values[PHONE] || "",
    groupId: values[GROUP_ID] || "",
    groupName: values[GROUP_NAME] || "",
  };
}

export async function saveZaloPhone(actorId: string, phone: string) {
  await writeSetting(PHONE, normalizeZaloPhone(phone), actorId);
}

export async function saveZaloLogin(
  actorId: string,
  input: {
    credentials: ZaloCredentials;
    accountName: string;
    accountUid: string;
    accountPhone: string;
  },
) {
  const now = nowISO();
  await writeSetting(CREDENTIALS, JSON.stringify(input.credentials), actorId, now);
  await writeSetting(ACCOUNT_NAME, input.accountName, actorId, now);
  await writeSetting(ACCOUNT_UID, input.accountUid, actorId, now);
  await writeSetting(ACCOUNT_PHONE, normalizeZaloPhone(input.accountPhone), actorId, now);
  await writeSetting(SAVED_AT, now, actorId, now);
}

export async function saveZaloCookies(actorId: string, credentials: ZaloCredentials) {
  const now = nowISO();
  await writeSetting(CREDENTIALS, JSON.stringify(credentials), actorId, now);
  await writeSetting(SAVED_AT, now, actorId, now);
}

export async function saveZaloGroup(actorId: string, groupId: string, groupName: string) {
  const now = nowISO();
  await writeSetting(GROUP_ID, groupId, actorId, now);
  await writeSetting(GROUP_NAME, groupName, actorId, now);
}

export async function clearZaloLogin(actorId: string) {
  const now = nowISO();
  for (const key of [CREDENTIALS, ACCOUNT_NAME, ACCOUNT_UID, ACCOUNT_PHONE, GROUP_ID, GROUP_NAME, SAVED_AT]) {
    await writeSetting(key, "", actorId, now);
  }
}

async function readKeys() {
  const db = await getDb();
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, SESSION_KEYS));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function parseCredentials(raw: string | undefined): ZaloCredentials | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ZaloCredentials>;
    if (!data.imei || !data.userAgent || !Array.isArray(data.cookies) || data.cookies.length === 0) return null;
    return {
      imei: data.imei,
      userAgent: data.userAgent,
      language: data.language || "vi",
      cookies: data.cookies,
    };
  } catch {
    return null;
  }
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
