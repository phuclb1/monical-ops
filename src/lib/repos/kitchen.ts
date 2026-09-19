import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { nid, nowISO } from "../datetime";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export async function getBreakfast(date: string) {
  const db = await getDb();
  return (await db.select().from(t.breakfasts).where(eq(t.breakfasts.date, date)))[0] ?? null;
}

export async function upsertBreakfast(user: SessionUser, date: string, data: Record<string, unknown>) {
  const db = await getDb();
  const existing = await getBreakfast(date);
  if (existing) {
    await db.update(t.breakfasts).set({ ...data, updatedAt: nowISO() }).where(eq(t.breakfasts.id, existing.id));
    await audit(user.id, "breakfast", existing.id, "update", existing, data);
    return existing.id;
  }
  const id = nid();
  await db.insert(t.breakfasts).values({
    id,
    date,
    adults: Number(data.adults || 0),
    children: Number(data.children || 0),
    vegetarian: Number(data.vegetarian || 0),
    allergy: Number(data.allergy || 0),
    early: Number(data.early || 0),
    takeaway: Number(data.takeaway || 0),
    notes: String(data.notes || ""),
    sentBy: user.id,
    confirmedBy: null,
    confirmedAt: null,
    actualAdults: null,
    actualChildren: null,
    updatedAt: nowISO(),
  });
  await notify({ role: "kitchen", title: "Số ăn sáng mới", body: `Lễ tân gửi dự báo ngày ${date}`, link: "/kitchen" });
  return id;
}

export async function confirmBreakfast(user: SessionUser, date: string) {
  const db = await getDb();
  const row = await getBreakfast(date);
  if (!row) throw new Error("Chưa có số ăn sáng");
  await db.update(t.breakfasts).set({ confirmedBy: user.id, confirmedAt: nowISO(), updatedAt: nowISO() }).where(eq(t.breakfasts.id, row.id));
  await notify({ role: "reception", title: "Bếp đã nhận số", body: `${user.fullName} xác nhận ăn sáng ${date}`, link: "/kitchen" });
}
