import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingLifeChip, bookingLifecycle } from "../src/lib/sales";

test("booking lifecycle is reserved → check-in → check-out", () => {
  const fresh = bookingLifecycle({ status: "reserved", deposit: 0, due: 1_000_000, source: "walk_in" });
  assert.equal(fresh.phase, "reserved");
  assert.deepEqual(fresh.steps.map((step) => [step.id, step.state]), [
    ["reserved", "current"],
    ["checkin", "pending"],
    ["checkout", "pending"],
  ]);
  assert.equal(bookingLifeChip(fresh).label, "Giữ chỗ");

  const staying = bookingLifecycle({ status: "inhouse", deposit: 500_000, due: 500_000, source: "phone" });
  assert.equal(staying.phase, "checkin");
  assert.deepEqual(staying.steps.map((step) => step.state), ["done", "current", "pending"]);
  assert.equal(bookingLifeChip(staying).label, "Đang ở");

  const left = bookingLifecycle({ status: "departed", deposit: 1_000_000, due: 0, source: "walk_in" });
  assert.equal(left.phase, "checkout");
  assert.deepEqual(left.steps.map((step) => step.state), ["done", "done", "current"]);
  assert.equal(bookingLifeChip(left).label, "Đã trả");
});

test("cancelled and no-show stay outside the stay stepper", () => {
  assert.equal(bookingLifecycle({ status: "cancelled" }).phase, "cancelled");
  assert.equal(bookingLifeChip(bookingLifecycle({ status: "no_show" })).label, "No-show");
});
