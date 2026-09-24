import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { isValidEmail, normalizeEmail } from "./account";
import { nid, nowISO } from "./datetime";
import { hashPassword, passwordValidationError } from "./password";
import { audit } from "./repos/audit";
import { SITE_URL } from "./site";

const RESET_TTL_MS = 30 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

async function sendResetEmail(to: string, fullName: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  if (!apiKey || !from) throw new Error("Thiếu RESEND_API_KEY hoặc PASSWORD_RESET_FROM");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Khôi phục mật khẩu MONICAL Ops",
      html: `<p>Xin chào ${escapeHtml(fullName)},</p>
<p>Bấm vào liên kết dưới đây để đặt lại mật khẩu MONICAL Ops:</p>
<p><a href="${escapeHtml(resetUrl)}">Đặt lại mật khẩu</a></p>
<p>Liên kết chỉ dùng được một lần và hết hạn sau 30 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Dịch vụ email trả về HTTP ${response.status}`);
}

export async function requestPasswordReset(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return;

  const db = await getDb();
  const user = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];
  if (!user?.active) return;

  const latest = (
    await db
      .select({ createdAt: passwordResetTokens.createdAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1)
  )[0];
  if (latest && Date.now() - new Date(latest.createdAt).getTime() < REQUEST_COOLDOWN_MS) return;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64Url(bytes);
  const id = nid();
  const createdAt = nowISO();
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db.insert(passwordResetTokens).values({
    id,
    userId: user.id,
    tokenHash: await tokenHash(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    usedAt: null,
    createdAt,
  });

  const resetUrl = new URL("/reset-password", SITE_URL);
  resetUrl.searchParams.set("token", token);
  try {
    await sendResetEmail(email, user.fullName, resetUrl.toString());
  } catch (error) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, id));
    console.error("Không gửi được email khôi phục mật khẩu:", error);
  }
}

export async function resetPasswordWithToken(token: string, password: string, confirmation: string) {
  if (password !== confirmation) return "Mật khẩu xác nhận không khớp";
  const validationError = passwordValidationError(password);
  if (validationError) return validationError;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return "Liên kết không hợp lệ hoặc đã hết hạn";

  const db = await getDb();
  const hash = await tokenHash(token);
  const reset = (
    await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, hash), isNull(passwordResetTokens.usedAt)))
      .limit(1)
  )[0];
  if (!reset || new Date(reset.expiresAt).getTime() <= Date.now()) {
    return "Liên kết không hợp lệ hoặc đã hết hạn";
  }
  const user = (await db.select().from(users).where(eq(users.id, reset.userId)).limit(1))[0];
  if (!user?.active) return "Liên kết không hợp lệ hoặc đã hết hạn";

  const usedAt = nowISO();
  const claimed = await db
    .update(passwordResetTokens)
    .set({ usedAt })
    .where(and(eq(passwordResetTokens.id, reset.id), isNull(passwordResetTokens.usedAt)))
    .returning({ id: passwordResetTokens.id });
  if (!claimed.length) return "Liên kết không hợp lệ hoặc đã hết hạn";

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      sessionVersion: sql`${users.sessionVersion} + 1`,
      updatedAt: usedAt,
    })
    .where(eq(users.id, user.id));
  await db
    .update(passwordResetTokens)
    .set({ usedAt })
    .where(and(eq(passwordResetTokens.userId, user.id), ne(passwordResetTokens.id, reset.id)));
  await audit(user.id, "user", user.id, "reset_password_email", undefined, { reset: true });
  return null;
}
