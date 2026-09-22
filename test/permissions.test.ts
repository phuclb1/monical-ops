import assert from "node:assert/strict";
import { test } from "node:test";
import { can } from "../src/lib/permissions";

test("chỉ quản lý được hủy booking", () => {
  assert.equal(can("manager", "cancelBooking"), true);
  assert.equal(can("reception", "cancelBooking"), false);
  assert.equal(can("hk", "cancelBooking"), false);
  assert.equal(can("accounting", "cancelBooking"), false);
  assert.equal(can("reception", "manageSales"), true);
});
