import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNTING_NAV, extraNav, homePath, isAccountingPath, MANAGER_NAV } from "../src/lib/nav";
import { datesUntil } from "../src/lib/datetime";
import { revenueTrend, roomPerformanceSummary, roomRevenueReport } from "../src/lib/sales-report";

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

test("manager home and mobile navigation include dashboard and reports", () => {
  assert.equal(homePath("manager"), "/");
  assert.equal(MANAGER_NAV[0]?.href, "/");
  assert.deepEqual(MANAGER_NAV[2], { href: "/reports", label: "Báo cáo" });
  assert.equal(extraNav("manager").some((item) => item.href === "/reports"), true);
});

test("room performance calculates occupancy, ADR and RevPAR", () => {
  assert.deepEqual(roomPerformanceSummary({ soldNights: 60, vacantNights: 40, revenue: 90_000_000 }), {
    availableNights: 100,
    occupancy: 0.6,
    adr: 1_500_000,
    revPar: 900_000,
  });
  assert.deepEqual(roomPerformanceSummary({ soldNights: 0, vacantNights: 0, revenue: 0 }), {
    availableNights: 0,
    occupancy: 0,
    adr: 0,
    revPar: 0,
  });
});

test("report charts cover the full year and group revenue correctly", () => {
  assert.equal(datesUntil("2026-01-01", "2027-01-01").length, 365);

  const trend = revenueTrend(
    [
      row({ checkIn: "2026-09-10", checkOut: "2026-09-11", status: "reserved", total: 100 }),
      row({ checkIn: "2026-09-11", checkOut: "2026-09-12", status: "inhouse", total: 200 }),
      row({ checkIn: "2026-09-11", checkOut: "2026-09-12", status: "cancelled", total: 300 }),
    ],
    "2026-09-01",
    "2026-10-01",
    "month",
  );

  assert.deepEqual(trend.find((item) => item.label === "10"), {
    key: "2026-09-10",
    label: "10",
    booked: 100,
    recognized: 0,
  });
  assert.deepEqual(trend.find((item) => item.label === "11"), {
    key: "2026-09-11",
    label: "11",
    booked: 200,
    recognized: 200,
  });
});

test("kế toán có khu vực điều hướng riêng", () => {
  assert.equal(homePath("accounting"), "/accounting");
  assert.equal(ACCOUNTING_NAV[0]?.href, "/accounting");
  assert.equal(isAccountingPath("/accounting"), true);
  assert.equal(isAccountingPath("/accounting/anything"), true);
  assert.equal(isAccountingPath("/reports"), false);
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
