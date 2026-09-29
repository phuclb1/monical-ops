import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { nowISO } from "@/lib/datetime";
import { cookieDeadline, normalizeZaloPhone } from "@/lib/zalo";
import { normalizeZaloChannels, type ZaloChannel, type ZaloChannelKey } from "@/lib/zalo-templates";
import {
  normalizeZaloGroups,
  normalizeZaloMessages,
  type ZaloGroupConfig,
  type ZaloGroupSlot,
  type ZaloMessage,
} from "@/lib/zalo-messages";

const PHONE = "zalo_sender_phone";
const CREDENTIALS = "zalo_credentials";
const ACCOUNT_NAME = "zalo_account_name";
const ACCOUNT_UID = "zalo_account_uid";
const ACCOUNT_PHONE = "zalo_account_phone";
const GROUP_ID = "zalo_group_id";
const GROUP_NAME = "zalo_group_name";
const CHANNELS = "zalo_channels";
const GROUPS = "zalo_groups";
const MESSAGES = "zalo_messages";
const SAVED_AT = "zalo_session_saved_at";

const SESSION_KEYS = [PHONE, CREDENTIALS, ACCOUNT_NAME, ACCOUNT_UID, ACCOUNT_PHONE, GROUP_ID, GROUP_NAME, CHANNELS, GROUPS, MESSAGES, SAVED_AT];

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
  channels: ZaloChannel[];
  groups: ZaloGroupConfig[];
  messages: ZaloMessage[];
  savedAt: string;
  encryptUntil: string | null;
  loginUntil: string | null;
};

export async function loadZaloPublicStatus(): Promise<ZaloPublicStatus> {
  const values = await readKeys();
  const credentials = parseCredentials(values[CREDENTIALS]);
  const deadline = cookieDeadline(credentials?.cookies);
  const channels = channelsFrom(values);
  const groups = groupsFrom(values, channels);
  const messages = messagesFrom(values, channels);
  const task = channels.find((item) => item.key === "task");
  return {
    phone: values[PHONE] || "",
    connected: Boolean(credentials),
    accountName: values[ACCOUNT_NAME] || "",
    accountPhone: values[ACCOUNT_PHONE] || "",
    groupId: task?.groupId || "",
    groupName: task?.groupName || "",
    channels,
    groups,
    messages,
    savedAt: values[SAVED_AT] || "",
    encryptUntil: deadline.encryptUntil,
    loginUntil: deadline.loginUntil,
  };
}

export async function zaloChannel(key: ZaloChannelKey) {
  const values = await readKeys();
  const channel = channelsFrom(values).find((item) => item.key === key);
  if (!channel) throw new Error("Không có loại thông báo này");
  return channel;
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

export async function loadZaloGroups() {
  const values = await readKeys();
  return groupsFrom(values, channelsFrom(values));
}

export async function loadZaloMessages() {
  const values = await readKeys();
  return messagesFrom(values, channelsFrom(values));
}

export async function saveZaloGroupSlot(actorId: string, group: ZaloGroupConfig) {
  const values = await readKeys();
  const groups = groupsFrom(values, channelsFrom(values)).map((item) => (item.slot === group.slot ? group : item));
  await writeSetting(GROUPS, JSON.stringify(groups), actorId);
}

export async function saveZaloMessage(actorId: string, message: ZaloMessage) {
  const values = await readKeys();
  const messages = messagesFrom(values, channelsFrom(values)).map((item) => (item.id === message.id ? message : item));
  await writeSetting(MESSAGES, JSON.stringify(messages), actorId);
}

export async function claimZaloSchedule(messageId: string, date: string) {
  const values = await readKeys();
  const messages = messagesFrom(values, channelsFrom(values));
  const current = messages.find((item) => item.id === messageId);
  if (!current || current.lastSentOn === date) return false;
  await writeSetting(
    MESSAGES,
    JSON.stringify(messages.map((item) => (item.id === messageId ? { ...item, lastSentOn: date } : item))),
    "zalo-cron",
  );
  return true;
}

export async function saveZaloChannel(actorId: string, channel: ZaloChannel) {
  const values = await readKeys();
  const channels = channelsFrom(values).map((item) => (item.key === channel.key ? channel : item));
  const now = nowISO();
  await writeSetting(CHANNELS, JSON.stringify(channels), actorId, now);
  if (channel.key === "task") {
    await writeSetting(GROUP_ID, channel.groupId, actorId, now);
    await writeSetting(GROUP_NAME, channel.groupName, actorId, now);
  }
}

export async function clearZaloLogin(actorId: string) {
  const values = await readKeys();
  const channels = channelsFrom(values).map((item) => ({ ...item, groupId: "", groupName: "" }));
  const groups = groupsFrom(values, channels).map((item) => ({ ...item, groupId: "", groupName: "" }));
  const now = nowISO();
  for (const key of [CREDENTIALS, ACCOUNT_NAME, ACCOUNT_UID, ACCOUNT_PHONE, GROUP_ID, GROUP_NAME, SAVED_AT]) {
    await writeSetting(key, "", actorId, now);
  }
  await writeSetting(CHANNELS, JSON.stringify(channels), actorId, now);
  await writeSetting(GROUPS, JSON.stringify(groups), actorId, now);
}

async function readKeys() {
  const db = await getDb();
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, SESSION_KEYS));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function groupsFrom(values: Record<string, string>, channels: ZaloChannel[]) {
  if (values[GROUPS]) {
    try {
      return normalizeZaloGroups(JSON.parse(values[GROUPS]));
    } catch {
      return normalizeZaloGroups(null);
    }
  }
  return normalizeZaloGroups(null, channels);
}

function messagesFrom(values: Record<string, string>, channels: ZaloChannel[]) {
  if (values[MESSAGES]) {
    try {
      return normalizeZaloMessages(JSON.parse(values[MESSAGES]));
    } catch {
      return normalizeZaloMessages(null);
    }
  }
  return normalizeZaloMessages(null, channels);
}

function channelsFrom(values: Record<string, string>) {
  const stored = values[CHANNELS];
  if (stored) {
    try {
      return normalizeZaloChannels(JSON.parse(stored));
    } catch {
      return normalizeZaloChannels(null);
    }
  }
  return normalizeZaloChannels(null, { groupId: values[GROUP_ID], groupName: values[GROUP_NAME] });
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
