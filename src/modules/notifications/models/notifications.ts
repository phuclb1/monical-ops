import { cache } from "react";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "@/lib/datetime";
import type { SessionUser } from "@/lib/types";
import { schedulePush } from "../utils/push";

export type NotifyInput = { userId?: string | null; role?: string | null; title: string; body: string; link?: string };

export function visibleNotifications(user: SessionUser) {
  return or(
    eq(t.notifications.userId, user.id),
    and(sql`${t.notifications.userId} is null`, eq(t.notifications.role, user.role)),
    and(sql`${t.notifications.userId} is null`, sql`${t.notifications.role} is null`),
  );
}

export async function notify(input: NotifyInput) {
  const db = await getDb();
  await db.insert(t.notifications).values({
    id: nid(),
    userId: input.userId ?? null,
    role: input.role ?? null,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    read: false,
    createdAt: nowISO(),
  });
  await schedulePush(input);
}

export async function listNotifications(user: SessionUser) {
  const db = await getDb();
  return db
    .select()
    .from(t.notifications)
    .where(visibleNotifications(user))
    .orderBy(desc(t.notifications.createdAt));
}

export const countUnreadNotifications = cache(async (user: SessionUser) => {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(t.notifications)
    .where(and(visibleNotifications(user), eq(t.notifications.read, false)));
  return Number(rows[0]?.n ?? 0);
});

export async function markNotifRead(user: SessionUser, id: string) {
  const db = await getDb();
  await db
    .update(t.notifications)
    .set({ read: true })
    .where(and(eq(t.notifications.id, id), visibleNotifications(user)));
}

export async function markAllNotifRead(user: SessionUser) {
  const db = await getDb();
  await db
    .update(t.notifications)
    .set({ read: true })
    .where(and(visibleNotifications(user), eq(t.notifications.read, false)));
}
