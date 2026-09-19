import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingKey,
  clampBreakfastPax,
  clampStayPax,
  defaultCheckout,
  formatOpsBookingCode,
  groupByBooking,
  isActiveSaleStatus,
  isGanttSaleStatus,
  isLegacyOpsBookingCode,
  isOpsBookingCode,
  occupiesNight,
  parseOpsBookingCode,
  parseSaleSource,
  quoteLinesBySaleId,
  rangesOverlap,
  rollupBookingStatus,
  roomMoveKind,
  saleStatusToStay,
} from "../src/lib/sales";

test("stay windows and active statuses", () => {
  assert.equal(rangesOverlap("2026-09-19", "2026-09-21", "2026-09-20", "2026-09-22"), true);
  assert.equal(rangesOverlap("2026-09-19", "2026-09-20", "2026-09-20", "2026-09-21"), false);
  assert.equal(occupiesNight("2026-09-19", "2026-09-21", "2026-09-20"), true);
  assert.equal(occupiesNight("2026-09-19", "2026-09-21", "2026-09-21"), false);
  assert.equal(isActiveSaleStatus("reserved"), true);
  assert.equal(isActiveSaleStatus("cancelled"), false);
  assert.equal(isGanttSaleStatus("departed"), true);
  assert.equal(isGanttSaleStatus("cancelled"), false);
});

test("OTA / walk-in source aliases and booking codes", () => {
  assert.equal(parseSaleSource("Traveloka"), "traveloka");
  assert.equal(parseSaleSource("vãng lai"), "walk_in");
  assert.equal(parseSaleSource("fb"), "facebook");
  assert.equal(parseSaleSource("dien thoai"), "phone");
  assert.equal(formatOpsBookingCode(3, 9), "BK-09-3");
  assert.deepEqual(parseOpsBookingCode("BK-09-3"), { month: 9, seq: 3 });
  assert.deepEqual(parseOpsBookingCode("BK-12/9"), { seq: 12, month: 9 });
  assert.equal(isOpsBookingCode("BK-09-3"), true);
  assert.equal(isLegacyOpsBookingCode("BK-12/9"), true);
  assert.equal(isOpsBookingCode("EZ-1"), false);
  assert.equal(bookingKey({ id: "sale-1", bookingId: "bk-1" }), "bk-1");
});

test("pax clamp, rollup, grouping, room move", () => {
  assert.deepEqual(clampStayPax(0, -1), { adults: 1, children: 0 });
  assert.deepEqual(clampBreakfastPax(2, 1, 9, 9, true), { adults: 2, children: 1 });
  assert.deepEqual(clampBreakfastPax(2, 1, 1, 0, false), { adults: 0, children: 0 });
  assert.equal(rollupBookingStatus(["cancelled", "inhouse", "reserved"]), "inhouse");
  assert.equal(rollupBookingStatus(["cancelled"]), "cancelled");
  assert.equal(saleStatusToStay("reserved"), "arriving");
  assert.equal(saleStatusToStay("no_show"), "no_show");
  assert.equal(defaultCheckout("2026-09-19"), "2026-09-20");

  const types = [
    { name: "Deluxe", sortOrder: 2, baseRate: 800_000 },
    { name: "Suite", sortOrder: 1, baseRate: 1_200_000 },
  ];
  assert.equal(roomMoveKind("Deluxe", "Deluxe", types), "same");
  assert.equal(roomMoveKind("Deluxe", "Suite", types), "upgrade");
  assert.equal(roomMoveKind("Suite", "Deluxe", types), null);

  const grouped = groupByBooking([
    { id: "a", bookingId: "bk" },
    { id: "b", bookingId: "bk" },
    { id: "c", bookingId: null },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped.find((row) => row.id === "bk")?.rooms.length, 2);

  const quotes = quoteLinesBySaleId([
    { id: "a", bookingId: "bk", rate: 1_000_000, checkIn: "2026-09-19", checkOut: "2026-09-20" },
    { id: "b", bookingId: "bk", rate: 500_000, checkIn: "2026-09-19", checkOut: "2026-09-20" },
  ]);
  assert.equal(quotes.get("a")?.total, 1_000_000);
  assert.equal(quotes.get("b")?.total, 500_000);
});
