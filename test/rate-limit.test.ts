import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "../src/lib/rate-limit";
import { searchHref } from "../src/lib/search-href";

test("sliding window blocks the request that exceeds the limit", () => {
  let now = 1_000;
  const limiter = createRateLimiter(() => now);
  assert.equal(limiter.take("login", 2, 10_000).ok, true);
  assert.equal(limiter.take("login", 2, 10_000).ok, true);
  const blocked = limiter.take("login", 2, 10_000);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.retryAfterMs, 10_000);
  now += 10_000;
  assert.equal(limiter.take("login", 2, 10_000).ok, true);
});

test("action claim rejects a second submit inside the window", () => {
  let now = 5_000;
  const limiter = createRateLimiter(() => now);
  assert.equal(limiter.claim("pay:user:booking", 800), true);
  assert.equal(limiter.claim("pay:user:booking", 800), false);
  assert.equal(limiter.claim("pay:user:other", 800), true);
  now += 800;
  assert.equal(limiter.claim("pay:user:booking", 800), true);
});

test("search href drops blank fields and keeps the path", () => {
  assert.equal(searchHref("/sales/bookings", [["q", "  "], ["view", "checkin"], ["tab", ""]]), "/sales/bookings?view=checkin");
  assert.equal(searchHref("/audit", [["entity", ""], ["action", ""]]), "/audit");
});
