import assert from "node:assert/strict";
import { test } from "node:test";
import { outboxStatusAfterFailure, tokenMatches } from "../src/lib/zalo-outbox";

test("tin lỗi gửi lại cho tới lần thứ năm", () => {
  assert.equal(outboxStatusAfterFailure(0), "pending");
  assert.equal(outboxStatusAfterFailure(3), "pending");
  assert.equal(outboxStatusAfterFailure(4), "failed");
});

test("token máy gửi phải khớp cả chuỗi", () => {
  assert.equal(tokenMatches("secret-token", "secret-token"), true);
  assert.equal(tokenMatches("secret-token", "secret-token "), false);
  assert.equal(tokenMatches("secret-token", ""), false);
  assert.equal(tokenMatches("", "secret-token"), false);
});
