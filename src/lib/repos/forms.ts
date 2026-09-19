import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO, todayVN } from "../datetime";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export async function listForms(q?: { code?: string; date?: string; room?: string; staff?: string }) {
  const db = await getDb();
  let rows = await db.select().from(t.formSubmissions).where(sql`${t.formSubmissions.deletedAt} is null`).orderBy(desc(t.formSubmissions.createdAt));
  if (q?.code) rows = rows.filter((r) => r.formCode === q.code);
  if (q?.date) rows = rows.filter((r) => r.date === q.date);
  if (q?.room) rows = rows.filter((r) => r.roomId === q.room);
  if (q?.staff) rows = rows.filter((r) => r.submittedBy === q.staff);
  return rows;
}

export async function getForm(id: string) {
  const db = await getDb();
  return (await db.select().from(t.formSubmissions).where(eq(t.formSubmissions.id, id)))[0] ?? null;
}

export async function saveForm(user: SessionUser, data: {
  formCode: string;
  payload: unknown;
  signature?: string;
  roomId?: string;
  stayId?: string;
  shiftId?: string;
}) {
  const db = await getDb();
  const id = nid();
  const now = nowISO();
  await db.insert(t.formSubmissions).values({
    id,
    formCode: data.formCode,
    shiftId: data.shiftId || null,
    roomId: data.roomId || null,
    stayId: data.stayId || null,
    date: todayVN(),
    payload: JSON.stringify(data.payload),
    signature: data.signature || null,
    submittedBy: user.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await audit(user.id, "form", id, "create", null, { formCode: data.formCode });
  return id;
}
