import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwt, SignJWT } from "jose";
import {
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  readSessionToken,
  RECEPTION_SESSION_MAX_AGE_SECONDS,
  sessionMaxAgeSeconds,
  signSession,
} from "../src/lib/session-token";
import type { Role, SessionUser } from "../src/lib/types";

function user(role: Role): SessionUser {
  return {
    id: `u-${role}`,
    username: role,
    fullName: role,
    role,
    departmentId: `d-${role}`,
    departmentCode: role === "manager" ? "management" : "reception",
    sessionVersion: 0,
  };
}

function testSecret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "ops-monical-dev-secret-change-me");
}

test("JWT lễ tân hết hạn sau 15 phút, role khác giữ 12 giờ", async () => {
  const receptionPayload = decodeJwt(await signSession(user("reception")));
  const managerPayload = decodeJwt(await signSession(user("manager")));

  assert.equal(sessionMaxAgeSeconds("reception"), 15 * 60);
  assert.equal(sessionMaxAgeSeconds("manager"), 12 * 60 * 60);
  assert.equal(receptionPayload.exp! - receptionPayload.iat!, RECEPTION_SESSION_MAX_AGE_SECONDS);
  assert.equal(managerPayload.exp! - managerPayload.iat!, DEFAULT_SESSION_MAX_AGE_SECONDS);
});

test("JWT lễ tân cũ quá 15 phút bị từ chối dù exp còn hạn", async () => {
  const now = Math.floor(Date.now() / 1000);
  const reception = user("reception");
  const token = await new SignJWT(reception)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - RECEPTION_SESSION_MAX_AGE_SECONDS - 1)
    .setExpirationTime(now + 60)
    .sign(testSecret());

  assert.equal(await readSessionToken(token), null);
});
