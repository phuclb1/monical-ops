"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { clearSessionCookie, loadUserSession, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const db = await getDb();
  const row = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!row || !row.active || !(await verifyPassword(password, row.passwordHash))) {
    redirect("/login?error=1");
  }
  const session = await loadUserSession(row.id);
  if (!session) redirect("/login?error=1");
  await setSessionCookie(session);
  redirect("/today");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
