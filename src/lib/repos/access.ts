import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, loginEvents, users } from "@/db/schema";
import { browserLabel } from "@/lib/browser";
import { nid, nowISO } from "@/lib/datetime";
import { isValidIp, normalizeIp, policyFromEnv, type ReceptionIpPolicy } from "@/lib/reception-ip";

const RESTRICT_KEY = "reception_ip_restrict";
const IP_KEY = "reception_allowed_ip";

export async function loadReceptionIpPolicy(): Promise<ReceptionIpPolicy> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [RESTRICT_KEY, IP_KEY]));
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (values[RESTRICT_KEY] === undefined) {
    const seeded = policyFromEnv();
    const now = nowISO();
    await db
      .insert(appSettings)
      .values([
        { key: RESTRICT_KEY, value: seeded.enabled ? "1" : "0", updatedAt: now, updatedBy: null },
        { key: IP_KEY, value: seeded.ip ?? "", updatedAt: now, updatedBy: null },
      ])
      .onConflictDoNothing();
    return seeded;
  }
  return {
    enabled: values[RESTRICT_KEY] === "1",
    ip: normalizeIp(values[IP_KEY]),
  };
}

export async function currentReceptionIpPolicy() {
  if (process.env.RECEPTION_IP_SOURCE === "env") return policyFromEnv();
  try {
    return await loadReceptionIpPolicy();
  } catch {
    return policyFromEnv();
  }
}

export function receptionIpInputError(enabled: boolean, ip: string) {
  if (!enabled) return null;
  if (!ip.trim()) return "Bật giới hạn thì phải điền IP của máy quầy.";
  if (!isValidIp(ip)) return "IP không hợp lệ.";
  return null;
}

export async function saveReceptionIpPolicy(actorId: string, enabled: boolean, ip: string) {
  const error = receptionIpInputError(enabled, ip);
  if (error) throw new Error(error);
  const db = await getDb();
  const now = nowISO();
  const storedIp = normalizeIp(ip) ?? "";
  const rows = [
    { key: RESTRICT_KEY, value: enabled ? "1" : "0", updatedAt: now, updatedBy: actorId },
    { key: IP_KEY, value: storedIp, updatedAt: now, updatedBy: actorId },
  ];
  for (const row of rows) {
    await db.insert(appSettings).values(row).onConflictDoUpdate({
      target: appSettings.key,
      set: { value: row.value, updatedAt: row.updatedAt, updatedBy: row.updatedBy },
    });
  }
}

export async function recordLogin(input: {
  userId?: string | null;
  username: string;
  result: "ok" | "denied" | "ip";
  ip?: string | null;
  userAgent?: string | null;
}) {
  const username = input.username.trim().toLowerCase();
  if (!username) return;
  try {
    const db = await getDb();
    await db.insert(loginEvents).values({
      id: nid(),
      userId: input.userId || null,
      username,
      result: input.result,
      ip: normalizeIp(input.ip) ?? null,
      userAgent: input.userAgent?.slice(0, 400) || null,
      browser: browserLabel(input.userAgent),
      createdAt: nowISO(),
    });
  } catch (error) {
    console.error("login log failed", error);
  }
}

export async function listLoginEvents(limit = 40) {
  const db = await getDb();
  return db
    .select({
      id: loginEvents.id,
      username: loginEvents.username,
      result: loginEvents.result,
      ip: loginEvents.ip,
      browser: loginEvents.browser,
      userAgent: loginEvents.userAgent,
      createdAt: loginEvents.createdAt,
      fullName: users.fullName,
    })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id))
    .orderBy(desc(loginEvents.createdAt))
    .limit(limit);
}
