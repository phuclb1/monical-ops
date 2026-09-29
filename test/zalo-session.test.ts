import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieDeadline, normalizeZaloPhone, zaloPhoneError, zaloPhonesMatch } from "../src/lib/zalo";

test("số Zalo lưu dạng 10 số bắt đầu bằng 0", () => {
  assert.equal(normalizeZaloPhone("+84 90 111 1007"), "0901111007");
  assert.equal(normalizeZaloPhone("84901111007"), "0901111007");
  assert.equal(normalizeZaloPhone("0901111007"), "0901111007");
  assert.equal(zaloPhoneError("0901111007"), null);
  assert.equal(zaloPhoneError("123"), "Số Zalo cần là số di động 10 chữ số.");
  assert.equal(zaloPhonesMatch("+84901111007", "0901111007"), true);
  assert.equal(zaloPhonesMatch("0901111007", "0902222008"), false);
});

test("hạn phiên lấy từ cookie mã hóa và cookie đăng nhập", () => {
  const deadline = cookieDeadline([
    { key: "zpw_sek", expires: "2026-10-05T00:00:00.000Z" },
    { name: "zpsid", expirationDate: 1790000000 },
    { key: "other", expires: "Infinity" },
  ]);
  assert.equal(deadline.encryptUntil, "2026-10-05T00:00:00.000Z");
  assert.equal(deadline.loginUntil, new Date(1790000000 * 1000).toISOString());
  assert.deepEqual(cookieDeadline([]), { encryptUntil: null, loginUntil: null });
});
