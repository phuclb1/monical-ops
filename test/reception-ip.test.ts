import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { browserLabel } from "../src/lib/browser";
import { clientIp, receptionIpBlocked } from "../src/lib/reception-ip";
import { signSession } from "../src/lib/session-token";
import type { SessionUser } from "../src/lib/types";

const reception: SessionUser = {
  id: "u-reception",
  username: "letan.test",
  fullName: "Lễ tân Test",
  role: "reception",
  departmentId: "d-reception",
  departmentCode: "reception",
  sessionVersion: 0,
};

process.env.RECEPTION_IP_SOURCE = "env";

const previous = process.env.RECEPTION_ALLOWED_IP;

function restoreAllowedIp() {
  if (previous === undefined) delete process.env.RECEPTION_ALLOWED_IP;
  else process.env.RECEPTION_ALLOWED_IP = previous;
}

test("đọc IP khách từ Cloudflare, không tin header tự gửi khi đã có CF-Connecting-IP", () => {
  const headers = new Headers({
    "cf-connecting-ip": "203.0.113.10",
    "x-forwarded-for": "198.51.100.4",
  });
  assert.equal(clientIp(headers), "203.0.113.10");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "::ffff:203.0.113.10, 1.1.1.1" })), "203.0.113.10");
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "10.0.0.8, 192.168.1.20, 117.2.80.239" })),
    "117.2.80.239",
  );
});

test("lễ tân bị chặn khi IP không khớp, role khác không bị chặn", () => {
  process.env.RECEPTION_ALLOWED_IP = "203.0.113.10";
  try {
    assert.equal(receptionIpBlocked("reception", new Headers({ "cf-connecting-ip": "198.51.100.4" })), true);
    assert.equal(receptionIpBlocked("reception", new Headers({ "cf-connecting-ip": "203.0.113.10" })), false);
    assert.equal(receptionIpBlocked("reception", new Headers()), true);
    assert.equal(receptionIpBlocked("manager", new Headers({ "cf-connecting-ip": "198.51.100.4" })), false);
  } finally {
    restoreAllowedIp();
  }
});

test("cấu hình tắt giới hạn thì lễ tân vào từ IP khác vẫn được", () => {
  process.env.RECEPTION_ALLOWED_IP = "203.0.113.10";
  try {
    const headers = new Headers({ "cf-connecting-ip": "198.51.100.4" });
    assert.equal(receptionIpBlocked("reception", headers, { enabled: false, ip: "203.0.113.10" }), false);
    assert.equal(receptionIpBlocked("reception", headers, { enabled: true, ip: "198.51.100.4" }), false);
    assert.equal(receptionIpBlocked("reception", headers, { enabled: true, ip: null }), true);
  } finally {
    restoreAllowedIp();
  }
});

test("nhận diện trình duyệt từ user agent", () => {
  assert.equal(
    browserLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"),
    "Chrome · Windows",
  );
  assert.equal(
    browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"),
    "Safari · iPhone/iPad",
  );
  assert.equal(browserLabel(""), "Không rõ");
});

test("chưa cấu hình IP thì lễ tân vẫn vào được", () => {
  delete process.env.RECEPTION_ALLOWED_IP;
  try {
    assert.equal(receptionIpBlocked("reception", new Headers({ "cf-connecting-ip": "198.51.100.4" })), false);
  } finally {
    restoreAllowedIp();
  }
});

test("middleware không đọc database nên phiên lễ tân vẫn đi qua proxy", async () => {
  process.env.RECEPTION_ALLOWED_IP = "203.0.113.10";
  try {
    const token = await signSession(reception);
    const response = await proxy(
      new NextRequest("https://example.com/today", {
        headers: { cookie: `ops_session=${token}`, "cf-connecting-ip": "198.51.100.4" },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(receptionIpBlocked("reception", new Headers({ "cf-connecting-ip": "198.51.100.4" })), true);
  } finally {
    restoreAllowedIp();
  }
});

test("lễ tân đúng IP và quản lý sai IP vẫn đi tiếp", async () => {
  process.env.RECEPTION_ALLOWED_IP = "203.0.113.10";
  try {
    const token = await signSession(reception);
    const allowed = await proxy(
      new NextRequest("https://example.com/today", {
        headers: { cookie: `ops_session=${token}`, "cf-connecting-ip": "203.0.113.10" },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("location"), null);

    const manager = await proxy(
      new NextRequest("https://example.com/today", {
        headers: {
          cookie: `ops_session=${await signSession({ ...reception, id: "u-manager", role: "manager", departmentCode: "management" })}`,
          "cf-connecting-ip": "198.51.100.4",
        },
      }),
    );
    assert.equal(manager.status, 200);
  } finally {
    restoreAllowedIp();
  }
});
