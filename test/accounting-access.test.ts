import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { signSession } from "../src/lib/session-token";
import type { SessionUser } from "../src/lib/types";

const baseUser: SessionUser = {
  id: "u-test-accounting",
  username: "ketoan.test",
  fullName: "Kế toán Test",
  role: "accounting",
  departmentId: "d-acc",
  departmentCode: "accounting",
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

test("kế toán bị chuyển khỏi mọi trang vận hành", async () => {
  const response = await request("/today", baseUser);
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") || "").pathname, "/accounting");
});

test("kế toán chỉ vào được view kế toán và đổi mật khẩu", async () => {
  const accounting = await request("/accounting", baseUser);
  assert.equal(accounting.status, 200);
  assert.equal(accounting.headers.get("location"), null);

  const password = await request("/account/password", baseUser);
  assert.equal(password.status, 200);
  assert.equal(password.headers.get("location"), null);
});

test("role khác không vào được view kế toán", async () => {
  const response = await request("/accounting", {
    ...baseUser,
    id: "u-manager",
    username: "manager.test",
    role: "manager",
    departmentId: "d-mgmt",
    departmentCode: "management",
  });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") || "").pathname, "/");
});
