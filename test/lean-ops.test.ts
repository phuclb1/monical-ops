import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { signSession } from "../src/lib/session-token";
import { homePath, isKitchenAllowedPath, isPausedOpsRole, isRemovedOpsPath } from "../src/lib/nav";
import type { SessionUser } from "../src/lib/types";

const reception: SessionUser = {
  id: "u-reception",
  username: "letan.test",
  fullName: "Lễ tân Test",
  role: "reception",
  departmentId: "d-rec",
  departmentCode: "reception",
  sessionVersion: 0,
};

async function request(path: string, user: SessionUser) {
  const token = await signSession(user);
  return proxy(
    new NextRequest(`https://example.com${path}`, {
      headers: { cookie: `ops_session=${token}` },
    }),
  );
}

test("hk and utility stay in the role list but cannot use the app", () => {
  assert.equal(isPausedOpsRole("hk"), true);
  assert.equal(isPausedOpsRole("utility"), true);
  assert.equal(isPausedOpsRole("kitchen"), false);
  assert.equal(isPausedOpsRole("reception"), false);
});

test("removed ops paths redirect to the role home", async () => {
  assert.equal(isRemovedOpsPath("/tasks"), true);
  assert.equal(isRemovedOpsPath("/today"), true);
  assert.equal(isRemovedOpsPath("/rooms/abc"), true);
  assert.equal(isRemovedOpsPath("/rooms/manage"), false);
  assert.equal(isRemovedOpsPath("/kitchen"), false);
  const response = await request("/tasks", reception);
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") || "").pathname, "/sales/bookings");
});

test("kitchen stays on breakfast pages and is sent home from booking", async () => {
  assert.equal(homePath("kitchen"), "/kitchen");
  assert.equal(isKitchenAllowedPath("/kitchen"), true);
  assert.equal(isKitchenAllowedPath("/kitchen/forecast"), true);
  assert.equal(isKitchenAllowedPath("/account/password"), true);
  assert.equal(isKitchenAllowedPath("/sales/bookings"), false);
  const kitchen: SessionUser = { ...reception, id: "u-kitchen", username: "bep.test", role: "kitchen", departmentCode: "kitchen" };
  const blocked = await request("/sales/bookings", kitchen);
  assert.equal(blocked.status, 307);
  assert.equal(new URL(blocked.headers.get("location") || "").pathname, "/kitchen");
  const allowed = await request("/kitchen", kitchen);
  assert.equal(allowed.status, 200);
});

test("hk session is sent back to login", async () => {
  const hk: SessionUser = { ...reception, id: "u-hk", username: "hk.test", role: "hk", departmentCode: "hk" };
  const response = await request("/sales/bookings", hk);
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location") || "");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "paused");
});
