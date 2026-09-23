import assert from "node:assert/strict";
import { test } from "node:test";
import { homePath, MANAGER_NAV } from "../src/lib/nav";
import { roomRevenueReport } from "../src/lib/sales-report";

function row(partial: { checkIn: string; checkOut: string; status: string; total?: number; source?: string }) {
  return {
    checkIn: partial.checkIn,
    checkOut: partial.checkOut,
    status: partial.status,
    total: partial.total ?? 1_000_000,
    due: 0,
    deposit: 0,
    source: partial.source,
  };
}

test("manager mobile home is the booking list", () => {
  assert.equal(homePath("manager"), "/sales/bookings");
  assert.equal(MANAGER_NAV[0]?.href, "/sales/bookings");
});

test("revenue is recognized on successful check-in, not checkout", () => {
  const report = roomRevenueReport(
    [
      row({ checkIn: "2026-09-10", checkOut: "2026-09-12", status: "reserved", total: 100 }),
      row({ checkIn: "2026-09-11", checkOut: "2026-09-13", status: "inhouse", total: 200 }),
      row({ checkIn: "2026-09-12", checkOut: "2026-10-01", status: "departed", total: 300 }),
      row({ checkIn: "2026-08-30", checkOut: "2026-09-02", status: "departed", total: 400 }),
      row({ checkIn: "2026-09-08", checkOut: "2026-09-09", status: "cancelled", total: 500 }),
      row({ checkIn: "2026-09-15", checkOut: "2026-09-16", status: "reserved", total: 700, source: "agoda" }),
      row({ checkIn: "2026-09-16", checkOut: "2026-09-17", status: "inhouse", total: 800, source: "booking" }),
    ],
    "2026-09-01",
    "2026-10-01",
  );

  assert.equal(report.booked.length, 5);
  assert.equal(report.booking.total, 2100);
  assert.equal(report.booking.ota, 1500);
  assert.equal(report.recognizedMoney.ota, 800);
  assert.deepEqual(
    report.recognized.map((item) => item.total),
    [200, 300, 800],
  );
  assert.equal(report.recognizedMoney.total, 1300);
});
