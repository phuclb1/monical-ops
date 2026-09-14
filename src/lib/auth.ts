import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { departments, users } from "./db/schema";
import { readSessionToken, SESSION_COOKIE, signSession } from "./session-token";
import type { DepartmentCode, Role, SessionUser } from "./types";

export { readSessionToken, signSession, SESSION_COOKIE };

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await readSessionToken(token);
  if (!session) return null;
  return loadUserSession(session.id);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function setSessionCookie(user: SessionUser) {
  const token = await signSession(user);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function loadUserSession(userId: string): Promise<SessionUser | null> {
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      departmentId: users.departmentId,
      departmentCode: departments.code,
    })
    .from(users)
    .innerJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    role: row.role as Role,
    departmentCode: row.departmentCode as DepartmentCode,
  };
}
