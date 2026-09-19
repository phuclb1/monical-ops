import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { loadUserSession, signSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session-token";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { homePath } from "@/lib/nav";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const db = await getDb();
  const row = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!row || !row.active || !(await verifyPassword(password, row.passwordHash))) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  const session = await loadUserSession(row.id);
  if (!session) return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  const token = await signSession(session);
  const res = NextResponse.redirect(new URL(homePath(session.role), request.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
