import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO, todayVN } from "../datetime";
import type { SessionUser } from "../types";
import { audit } from "./audit";

const FORM_LIST_COLUMNS = {
  id: t.formSubmissions.id,
  formCode: t.formSubmissions.formCode,
  shiftId: t.formSubmissions.shiftId,
  roomId: t.formSubmissions.roomId,
  stayId: t.formSubmissions.stayId,
  date: t.formSubmissions.date,
  submittedBy: t.formSubmissions.submittedBy,
  createdAt: t.formSubmissions.createdAt,
  updatedAt: t.formSubmissions.updatedAt,
  deletedAt: t.formSubmissions.deletedAt,
};

export async function listForms(q?: { code?: string; date?: string; room?: string; staff?: string; limit?: number }) {
  const db = await getDb();
  const clauses: SQL[] = [isNull(t.formSubmissions.deletedAt)];
  if (q?.code) clauses.push(eq(t.formSubmissions.formCode, q.code));
  if (q?.date) clauses.push(eq(t.formSubmissions.date, q.date));
  if (q?.room) clauses.push(eq(t.formSubmissions.roomId, q.room));
  if (q?.staff) clauses.push(eq(t.formSubmissions.submittedBy, q.staff));
  const query = db.select(FORM_LIST_COLUMNS).from(t.formSubmissions).where(and(...clauses)).orderBy(desc(t.formSubmissions.createdAt));
  return q?.limit && q.limit > 0 ? query.limit(q.limit) : query;
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
