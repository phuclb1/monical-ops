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

test("trang kiểm tra phòng trống là link công khai", async () => {
  const response = await proxy(new NextRequest("https://example.com/kiem-tra-phong?checkIn=2026-09-25&checkOut=2026-09-26"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
});

test("kế toán bị chuyển khỏi mọi trang vận hành", async () => {
  const response = await request("/today", baseUser);
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location") || "").pathname, "/accounting");
});

test("kế toán vào được view kế toán, sơ đồ phòng và đổi mật khẩu", async () => {
  const accounting = await request("/accounting", baseUser);
  assert.equal(accounting.status, 200);
  assert.equal(accounting.headers.get("location"), null);

  const chart = await request("/sales", baseUser);
  assert.equal(chart.status, 200);
  assert.equal(chart.headers.get("location"), null);

  const password = await request("/account/password", baseUser);
  assert.equal(password.status, 200);
  assert.equal(password.headers.get("location"), null);
});

test("kế toán không vào trang bán hoặc sửa booking", async () => {
  for (const path of ["/sales/bookings", "/sales/new", "/sales/abc"]) {
    const response = await request(path, baseUser);
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location") || "").pathname, "/accounting");
  }
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
