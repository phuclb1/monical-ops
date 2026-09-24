"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { clearSessionCookie, loadUserSession, requireSession, setSessionCookie } from "@/lib/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { homePath } from "@/lib/nav";
import { hashPassword, passwordNeedsRehash, passwordValidationError, verifyPassword } from "@/lib/password";
import { nowISO } from "@/lib/datetime";
import { audit } from "@/lib/repos";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const db = await getDb();
  const row = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!row || !row.active || !(await verifyPassword(password, row.passwordHash))) {
    redirect("/login?error=1");
  }
  if (passwordNeedsRehash(row.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: nowISO() }).where(eq(users.id, row.id));
  }
  const session = await loadUserSession(row.id);
  if (!session) redirect("/login?error=1");
  await setSessionCookie(session);
  redirect(homePath(session.role));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmation = String(formData.get("confirmation") || "");
  const fail = (message: string): never =>
    redirect(`/account/password?error=${encodeURIComponent(message)}`);

  if (newPassword !== confirmation) fail("Mật khẩu xác nhận không khớp");
  const validationError = passwordValidationError(newPassword);
  if (validationError) fail(validationError);
  if (currentPassword === newPassword) fail("Mật khẩu mới phải khác mật khẩu hiện tại");

  const db = await getDb();
  const user = (await db.select().from(users).where(eq(users.id, session.id)).limit(1))[0];
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    fail("Mật khẩu hiện tại không đúng");
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: nowISO(),
    })
    .where(eq(users.id, session.id));
  await audit(session.id, "user", session.id, "change_password", undefined, { changed: true });
  const live = await loadUserSession(session.id);
  if (!live) {
    await clearSessionCookie();
    redirect("/login");
  }
  await setSessionCookie(live);
  redirect("/account/password?ok=1");
}
