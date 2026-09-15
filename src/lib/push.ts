import { and, eq, inArray } from "drizzle-orm";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { getDb } from "./db";
import * as t from "./db/schema";
import { nid, nowISO } from "./datetime";

export type NotifyPush = { userId?: string | null; role?: string | null; title: string; body: string; link?: string };

function vapidKeys() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_APP_URL || "https://ops-monical.phuclb1.workers.dev";
  if (!publicKey || !privateKey) return null;
  return { subject: subject.startsWith("mailto:") || subject.startsWith("http") ? subject : `https://${subject}`, publicKey, privateKey };
}

export function vapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } },
  userAgent?: string | null,
) {
  const endpoint = sub.endpoint?.trim();
  const p256dh = sub.keys?.p256dh?.trim();
  const auth = sub.keys?.auth?.trim();
  if (!endpoint?.startsWith("https://") || !p256dh || !auth) throw new Error("Subscription không hợp lệ");
  const db = await getDb();
  const now = nowISO();
  const existing = (await db.select().from(t.pushSubscriptions).where(eq(t.pushSubscriptions.endpoint, endpoint)).limit(1))[0];
  if (existing) {
    await db
      .update(t.pushSubscriptions)
      .set({ userId, p256dh, auth, userAgent: userAgent || existing.userAgent, updatedAt: now })
      .where(eq(t.pushSubscriptions.id, existing.id));
    return existing.id;
  }
  const id = nid();
  await db.insert(t.pushSubscriptions).values({
    id,
    userId,
    endpoint,
    p256dh,
    auth,
    userAgent: userAgent || null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function deletePushSubscription(userId: string, endpoint?: string) {
  const db = await getDb();
  if (endpoint) {
    await db
      .delete(t.pushSubscriptions)
      .where(and(eq(t.pushSubscriptions.userId, userId), eq(t.pushSubscriptions.endpoint, endpoint)));
    return;
  }
  await db.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, userId));
}

async function subscriptionsFor(input: NotifyPush) {
  const db = await getDb();
  const userIds = new Set<string>();
  if (input.userId) userIds.add(input.userId);
  if (input.role) {
    const people = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(eq(t.users.role, input.role), eq(t.users.active, true)));
    for (const person of people) userIds.add(person.id);
  }
  if (!userIds.size) return [];
  return db.select().from(t.pushSubscriptions).where(inArray(t.pushSubscriptions.userId, [...userIds]));
}

async function sendPushForNotify(input: NotifyPush) {
  const vapid = vapidKeys();
  if (!vapid) return;
  const rows = await subscriptionsFor(input);
  if (!rows.length) return;
  const data = { title: input.title, body: input.body, url: input.link || "/notifications" };
  for (const row of rows) {
    try {
      const subscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const payload = await buildPushPayload({ data, options: { ttl: 60 * 60 * 6, urgency: "high" } }, subscription, vapid);
      const res = await fetch(row.endpoint, {
        method: "POST",
        headers: {
          Authorization: payload.headers.authorization,
          TTL: payload.headers.ttl,
          Urgency: payload.headers.urgency || "high",
          "Content-Encoding": payload.headers["content-encoding"],
          "Content-Type": payload.headers["content-type"],
          "Content-Length": payload.headers["content-length"],
        },
        body: payload.body,
      });
      if (res.status === 404 || res.status === 410) {
        const db = await getDb();
        await db.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.id, row.id));
      }
    } catch (error) {
      console.error("web-push send", row.id, error);
    }
  }
}

export async function schedulePush(input: NotifyPush) {
  const job = sendPushForNotify(input).catch((error) => console.error("web-push", error));
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx?.waitUntil) {
      ctx.waitUntil(job);
      return;
    }
  } catch {
    // local next dev
  }
  await job;
}
