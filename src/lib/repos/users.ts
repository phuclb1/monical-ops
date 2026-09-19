import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";

export const listUsers = cache(async () => {
  const db = await getDb();
  return db
    .select({
      id: t.users.id,
      username: t.users.username,
      fullName: t.users.fullName,
      role: t.users.role,
      departmentId: t.users.departmentId,
      departmentCode: t.departments.code,
      phone: t.users.phone,
      active: t.users.active,
    })
    .from(t.users)
    .innerJoin(t.departments, eq(t.users.departmentId, t.departments.id));
});
