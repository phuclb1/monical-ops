import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { loadUserSession, signSession } from "@/lib/auth";
import { SESSION_COOKIE, sessionMaxAgeSeconds } from "@/lib/session-token";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { homePath } from "@/lib/nav";
import { clientIp, receptionIpBlocked } from "@/lib/reception-ip";
import { currentReceptionIpPolicy, recordLogin } from "@/lib/repos/access";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/lib/password";
import { nowISO } from "@/lib/datetime";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const db = await getDb();
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  const row = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!row || !row.active || !(await verifyPassword(password, row.passwordHash))) {
    await recordLogin({ userId: row?.id ?? null, username, result: "denied", ip, userAgent });
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  if (passwordNeedsRehash(row.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: nowISO() }).where(eq(users.id, row.id));
  }
  const session = await loadUserSession(row.id);
  if (!session) return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  const policy = await currentReceptionIpPolicy();
  if (receptionIpBlocked(session.role, request.headers, policy)) {
    await recordLogin({ userId: session.id, username, result: "ip", ip, userAgent });
    return NextResponse.redirect(new URL("/login?error=ip", request.url), 303);
  }
  await recordLogin({ userId: session.id, username, result: "ok", ip, userAgent });
  const token = await signSession(session);
  const res = NextResponse.redirect(new URL(homePath(session.role), request.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds(session.role),
  });
  return res;
}
