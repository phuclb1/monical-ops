import { SignJWT, jwtVerify } from "jose";
import type { DepartmentCode, Role, SessionUser } from "./types";

export const SESSION_COOKIE = "ops_session";
export const RECEPTION_SESSION_MAX_AGE_SECONDS = 15 * 60;
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export function sessionMaxAgeSeconds(role: Role) {
  return role === "reception" ? RECEPTION_SESSION_MAX_AGE_SECONDS : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

function secret() {
  const raw = process.env.SESSION_SECRET || "ops-monical-dev-secret-change-me";
  return new TextEncoder().encode(raw);
}

export async function signSession(user: SessionUser) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    sessionVersion: user.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionMaxAgeSeconds(user.role))
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = payload.role as Role;
    if (
      role === "reception" &&
      (typeof payload.iat !== "number" || Math.floor(Date.now() / 1000) >= payload.iat + RECEPTION_SESSION_MAX_AGE_SECONDS)
    ) {
      return null;
    }
    return {
      id: String(payload.id),
      username: String(payload.username),
      fullName: String(payload.fullName),
      role,
      departmentId: String(payload.departmentId),
      departmentCode: payload.departmentCode as DepartmentCode,
      sessionVersion: Number(payload.sessionVersion || 0),
    };
  } catch {
    return null;
  }
}
