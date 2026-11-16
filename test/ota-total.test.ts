import assert from "node:assert/strict";
import { test } from "node:test";
import { alignQuoteTotal, computeBookingMoney, ratesFromBookingTotal } from "../src/lib/sales";

test("OTA total splits into nightly rates that add back up", () => {
  assert.deepEqual(ratesFromBookingTotal(1_000_000, [2]), [500_000]);
  assert.deepEqual(ratesFromBookingTotal(1_000_000, [2, 2]), [250_000, 250_000]);
  assert.deepEqual(ratesFromBookingTotal(900_000, [1, 2]), [300_000, 300_000]);
  const odd = ratesFromBookingTotal(1_000_000, [3]);
  assert.equal(odd[0] * 3, 999_999);
  assert.deepEqual(ratesFromBookingTotal(0, [2]), [0]);
});

test("stored OTA bill is the room total, not the nightly split", () => {
  const money = computeBookingMoney([
    {
      status: "reserved",
      rate: 333_333,
      checkIn: "2026-11-01",
      checkOut: "2026-11-04",
      otaBill: 1_000_000,
      deposit: 0,
    },
  ]);
  assert.equal(money.roomTotal, 1_000_000);
  assert.equal(money.subtotal, 1_000_000);
  assert.equal(money.total, 1_000_000);
});

test("quote lines show the typed bill when the nightly split is short", () => {
  const lines = alignQuoteTotal([{ gross: 999_999, subtotal: 999_999, total: 999_999 }], 1_000_000);
  assert.equal(lines[0].total, 1_000_000);
  assert.equal(lines[0].gross, 1_000_000);
});
