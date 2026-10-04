import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingMatchesListView, isBookingListView } from "../src/lib/sales";

const today = "2026-10-04";

test("booking list view accepts only the desk views", () => {
  assert.equal(isBookingListView("new"), true);
  assert.equal(isBookingListView("checkin"), true);
  assert.equal(isBookingListView("checkout"), true);
  assert.equal(isBookingListView("open"), false);
});

test("newest view keeps every booking", () => {
  assert.equal(
    bookingMatchesListView({ checkIn: "2026-10-01", checkOut: "2026-10-02", status: "cancelled" }, "new", today),
    true,
  );
});

test("check-in and check-out views match a room on today and skip cancelled stays", () => {
  const mixed = {
    checkIn: "2026-10-03",
    checkOut: "2026-10-06",
    status: "inhouse",
    rooms: [
      { checkIn: "2026-10-03", checkOut: "2026-10-06", status: "inhouse" },
      { checkIn: today, checkOut: "2026-10-06", status: "reserved" },
      { checkIn: today, checkOut: today, status: "cancelled" },
    ],
  };
  assert.equal(bookingMatchesListView(mixed, "checkin", today), true);
  assert.equal(bookingMatchesListView(mixed, "checkout", today), false);

  const leaving = {
    checkIn: "2026-10-02",
    checkOut: today,
    status: "inhouse",
    rooms: [{ checkIn: "2026-10-02", checkOut: today, status: "departed" }],
  };
  assert.equal(bookingMatchesListView(leaving, "checkout", today), true);
  assert.equal(bookingMatchesListView(leaving, "checkin", today), false);

  const skipped = {
    checkIn: today,
    checkOut: "2026-10-05",
    status: "no_show",
    rooms: [{ checkIn: today, checkOut: "2026-10-05", status: "no_show" }],
  };
  assert.equal(bookingMatchesListView(skipped, "checkin", today), false);
});
