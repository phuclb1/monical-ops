import { cache } from "react";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";

const USER_LIST_COLUMNS = {
  id: t.users.id,
  username: t.users.username,
  email: t.users.email,
  fullName: t.users.fullName,
  role: t.users.role,
  departmentId: t.users.departmentId,
  departmentCode: t.departments.code,
  phone: t.users.phone,
  active: t.users.active,
};

export const listUsers = cache(async () => {
  const db = await getDb();
  return db.select(USER_LIST_COLUMNS).from(t.users).innerJoin(t.departments, eq(t.users.departmentId, t.departments.id));
});

export async function getUser(id: string) {
  const trimmed = String(id || "").trim();
  if (!trimmed) return null;
  const db = await getDb();
  return (
    (await db.select(USER_LIST_COLUMNS).from(t.users).innerJoin(t.departments, eq(t.users.departmentId, t.departments.id)).where(eq(t.users.id, trimmed)).limit(1))[0] ??
    null
  );
}

export async function usersByIds(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!unique.length) return [];
  const db = await getDb();
  return db.select(USER_LIST_COLUMNS).from(t.users).innerJoin(t.departments, eq(t.users.departmentId, t.departments.id)).where(inArray(t.users.id, unique));
}
