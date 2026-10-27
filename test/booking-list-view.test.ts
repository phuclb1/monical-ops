import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingMatchesListView, isBookingListView } from "../src/lib/sales";

const today = "2026-10-04";

test("booking list view accepts the desk quick picks", () => {
  assert.equal(isBookingListView("new"), true);
  assert.equal(isBookingListView("month"), true);
  assert.equal(isBookingListView("checkin"), true);
  assert.equal(isBookingListView("stay"), true);
  assert.equal(isBookingListView("checkout"), true);
  assert.equal(isBookingListView("tomorrow"), true);
  assert.equal(isBookingListView("open"), false);
});

test("newest view keeps every booking", () => {
  assert.equal(
    bookingMatchesListView({ checkIn: "2026-10-01", checkOut: "2026-10-02", status: "cancelled" }, "new", today),
    true,
  );
});

test("quick picks match an active room and skip closed stays", () => {
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
  assert.equal(bookingMatchesListView(mixed, "month", today), true);
  assert.equal(bookingMatchesListView(mixed, "stay", today), true);
  assert.equal(bookingMatchesListView(mixed, "checkout", today), false);
  assert.equal(bookingMatchesListView(mixed, "tomorrow", today), false);

  const leaving = {
    checkIn: "2026-10-02",
    checkOut: today,
    status: "inhouse",
    rooms: [{ checkIn: "2026-10-02", checkOut: today, status: "inhouse" }],
  };
  assert.equal(bookingMatchesListView(leaving, "checkout", today), true);
  assert.equal(bookingMatchesListView(leaving, "stay", today), false);
  assert.equal(bookingMatchesListView(leaving, "checkin", today), false);

  const alreadyLeft = {
    checkIn: "2026-10-02",
    checkOut: today,
    status: "departed",
    rooms: [{ checkIn: "2026-10-02", checkOut: today, status: "departed" }],
  };
  assert.equal(bookingMatchesListView(alreadyLeft, "checkout", today), false);

  const arrivingTomorrow = {
    checkIn: "2026-10-05",
    checkOut: "2026-10-07",
    status: "reserved",
  };
  assert.equal(bookingMatchesListView(arrivingTomorrow, "tomorrow", today), true);
  assert.equal(bookingMatchesListView(arrivingTomorrow, "month", today), true);
  assert.equal(bookingMatchesListView(arrivingTomorrow, "stay", today), false);

  const nextMonth = {
    checkIn: "2026-11-01",
    checkOut: "2026-11-02",
    status: "reserved",
  };
  assert.equal(bookingMatchesListView(nextMonth, "month", today), false);

  const skipped = {
    checkIn: today,
    checkOut: "2026-10-05",
    status: "no_show",
    rooms: [{ checkIn: today, checkOut: "2026-10-05", status: "no_show" }],
  };
  assert.equal(bookingMatchesListView(skipped, "checkin", today), false);
  assert.equal(bookingMatchesListView(skipped, "stay", today), false);
});
