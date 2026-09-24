import { SignJWT, jwtVerify } from "jose";
import type { DepartmentCode, Role, SessionUser } from "./types";

export const SESSION_COOKIE = "ops_session";

function secret() {
  const raw = process.env.SESSION_SECRET || "ops-monical-dev-secret-change-me";
  return new TextEncoder().encode(raw);
}

export async function signSession(user: SessionUser) {
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
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      username: String(payload.username),
      fullName: String(payload.fullName),
      role: payload.role as Role,
      departmentId: String(payload.departmentId),
      departmentCode: payload.departmentCode as DepartmentCode,
      sessionVersion: Number(payload.sessionVersion || 0),
    };
  } catch {
    return null;
  }
}
