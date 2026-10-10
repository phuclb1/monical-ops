import assert from "node:assert/strict";
import { test } from "node:test";
import { ratesFromBookingTotal } from "../src/lib/sales";

test("OTA total splits into nightly rates that add back up", () => {
  assert.deepEqual(ratesFromBookingTotal(1_000_000, [2]), [500_000]);
  assert.deepEqual(ratesFromBookingTotal(1_000_000, [2, 2]), [250_000, 250_000]);
  assert.deepEqual(ratesFromBookingTotal(900_000, [1, 2]), [300_000, 300_000]);
  const odd = ratesFromBookingTotal(1_000_000, [3]);
  assert.equal(odd[0] * 3, 999_999);
  assert.deepEqual(ratesFromBookingTotal(0, [2]), [0]);
});
