import assert from "node:assert/strict";
import { test } from "node:test";
import { chartReturnHref, withChartReturn } from "../src/lib/chart-return";

test("chart return keeps the room chart filters", () => {
  const chart = "/sales?date=2026-11-01&origin=ezcloud&focus=inhouse&view=month&group=type";
  assert.equal(chartReturnHref(chart), chart);
  assert.equal(chartReturnHref("/sales"), "/sales");
  assert.equal(
    withChartReturn("/sales/bookings/b1", chart),
    `/sales/bookings/b1?from=${encodeURIComponent(chart)}`,
  );
  assert.equal(chartReturnHref(new URLSearchParams(`from=${encodeURIComponent(chart)}`).get("from")), chart);
});

test("chart return rejects paths outside the room chart", () => {
  assert.equal(chartReturnHref("/sales/bookings"), null);
  assert.equal(chartReturnHref("//sales"), null);
  assert.equal(chartReturnHref("/sales?date=nope"), null);
  assert.equal(chartReturnHref("/sales?origin=other"), null);
  assert.equal(withChartReturn("/sales/bookings/b1", "/sales/bookings"), "/sales/bookings/b1");
});
