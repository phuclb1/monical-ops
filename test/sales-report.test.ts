import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNTING_NAV, homePath, isAccountingAllowedPath, isAccountingPath, MANAGER_NAV, sidebarNav } from "../src/lib/nav";
import { datesUntil } from "../src/lib/datetime";
import { invoiceRevenueReport, revenueTrend, roomPerformanceSummary, roomRevenueReport } from "../src/lib/sales-report";

function row(partial: {
  checkIn: string;
  checkOut: string;
  status: string;
  total?: number;
  source?: string;
  invoiceRequested?: boolean;
  otaPaymentMode?: "debt" | "hotel";
  otaCommissionPercent?: number;
  otaCommissionKind?: "percent" | "amount";
  otaCommissionValue?: number;
  cashPaid?: number;
  transferPaid?: number;
  companyPaid?: number;
}) {
  return {
    checkIn: partial.checkIn,
    checkOut: partial.checkOut,
    status: partial.status,
    total: partial.total ?? 1_000_000,
    due: 0,
    deposit: (partial.cashPaid || 0) + (partial.transferPaid || 0) + (partial.companyPaid || 0),
    cashPaid: partial.cashPaid,
    transferPaid: partial.transferPaid,
    companyPaid: partial.companyPaid,
    source: partial.source,
    otaPaymentMode: partial.otaPaymentMode,
    otaCommissionPercent: partial.otaCommissionPercent,
    otaCommissionKind: partial.otaCommissionKind,
    otaCommissionValue: partial.otaCommissionValue,
    invoiceRequested: partial.invoiceRequested,
  };
}

test("manager home and mobile navigation include dashboard and reports", () => {
  assert.equal(homePath("manager"), "/");
  assert.equal(MANAGER_NAV[0]?.href, "/");
  assert.deepEqual(MANAGER_NAV[2], { href: "/reports", label: "Báo cáo" });
  const manage = sidebarNav("manager").blocks.find((block) => block.kind === "group" && block.label === "Quản lý");
  assert.deepEqual(manage, { kind: "group", label: "Quản lý", items: [{ href: "/reports", label: "Báo cáo" }] });
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
    "2026-09-10",
  );

  assert.deepEqual(trend.find((item) => item.label === "10"), {
    key: "2026-09-10",
    label: "10",
    booked: 100,
    recognized: 100,
  });
  assert.deepEqual(trend.find((item) => item.label === "11"), {
    key: "2026-09-11",
    label: "11",
    booked: 200,
    recognized: 0,
  });
});

test("kế toán có khu vực điều hướng riêng và xem được sơ đồ phòng", () => {
  assert.equal(homePath("accounting"), "/accounting");
  assert.equal(ACCOUNTING_NAV[0]?.href, "/accounting");
  assert.equal(ACCOUNTING_NAV.some((item) => item.href === "/sales"), true);
  assert.equal(isAccountingPath("/accounting"), true);
  assert.equal(isAccountingPath("/accounting/anything"), true);
  assert.equal(isAccountingPath("/reports"), false);
  assert.equal(isAccountingAllowedPath("/sales"), true);
  assert.equal(isAccountingAllowedPath("/sales/bookings"), false);
  assert.equal(isAccountingAllowedPath("/sales/new"), false);
});

test("revenue is recognized on the check-in date when the booking is not cancelled", () => {
  const report = roomRevenueReport(
    [
      row({ checkIn: "2026-09-10", checkOut: "2026-09-12", status: "reserved", total: 100 }),
      row({ checkIn: "2026-09-11", checkOut: "2026-09-13", status: "inhouse", total: 200 }),
      row({ checkIn: "2026-09-12", checkOut: "2026-10-01", status: "departed", total: 300 }),
      row({ checkIn: "2026-08-30", checkOut: "2026-09-02", status: "departed", total: 400 }),
      row({ checkIn: "2026-09-08", checkOut: "2026-09-09", status: "cancelled", total: 500 }),
      row({ checkIn: "2026-09-14", checkOut: "2026-09-15", status: "no_show", total: 600 }),
      row({ checkIn: "2026-09-15", checkOut: "2026-09-16", status: "reserved", total: 700, source: "agoda" }),
      row({ checkIn: "2026-09-16", checkOut: "2026-09-17", status: "reserved", total: 800, source: "booking" }),
    ],
    "2026-09-01",
    "2026-10-01",
    "2026-09-12",
  );

  assert.equal(report.booked.length, 5);
  assert.equal(report.booking.total, 2100);
  assert.equal(report.booking.ota, 1500);
  assert.equal(report.recognizedMoney.ota, 0);
  assert.deepEqual(
    report.recognized.map((item) => item.total),
    [100, 200, 300],
  );
  assert.equal(report.recognizedMoney.total, 600);
});

test("recognized month splits direct collections and OTA after commission", () => {
  const report = roomRevenueReport(
    [
      row({ checkIn: "2026-09-10", checkOut: "2026-09-11", status: "reserved", total: 1_000, source: "agoda", otaPaymentMode: "debt", otaCommissionPercent: 15 }),
      row({
        checkIn: "2026-09-11",
        checkOut: "2026-09-12",
        status: "reserved",
        total: 2_000,
        source: "booking",
        otaPaymentMode: "hotel",
        otaCommissionKind: "amount",
        otaCommissionValue: 300,
        companyPaid: 2_000,
      }),
      row({
        checkIn: "2026-09-12",
        checkOut: "2026-09-13",
        status: "reserved",
        total: 500,
        source: "walk_in",
        transferPaid: 300,
        cashPaid: 200,
      }),
      row({ checkIn: "2026-09-20", checkOut: "2026-09-21", status: "reserved", total: 800, source: "agoda", otaPaymentMode: "debt" }),
    ],
    "2026-09-01",
    "2026-10-01",
    "2026-09-12",
  );

  assert.equal(report.booking.total, 4_300);
  assert.equal(report.recognizedMoney.total, 3_500);
  assert.equal(report.recognizedSplit.pay.transfer, 300);
  assert.equal(report.recognizedSplit.pay.cash, 200);
  assert.equal(report.recognizedSplit.pay.company, 0);
  assert.equal(report.recognizedSplit.ota.commission, 450);
  assert.equal(report.recognizedSplit.ota.net, 2_550);
  assert.equal(report.recognizedSplit.ota.partnerNet, 850);
  assert.equal(report.recognizedSplit.ota.collectedGross, 2_000);
  assert.equal(report.recognizedSplit.ota.collectedCommission, 300);
});

test("invoice revenue includes direct bookings that request an invoice and all OTA", () => {
  const invoice = invoiceRevenueReport([
    row({ checkIn: "2026-09-10", checkOut: "2026-09-11", status: "inhouse", total: 100, source: "walk_in", invoiceRequested: true }),
    row({ checkIn: "2026-09-11", checkOut: "2026-09-12", status: "departed", total: 200, source: "phone", invoiceRequested: false }),
    row({ checkIn: "2026-09-12", checkOut: "2026-09-13", status: "inhouse", total: 300, source: "agoda", invoiceRequested: false }),
    row({ checkIn: "2026-09-13", checkOut: "2026-09-14", status: "inhouse", total: 400, source: "booking", invoiceRequested: true }),
  ]);

  assert.deepEqual(
    invoice.rows.map((item) => item.total),
    [100, 300, 400],
  );
  assert.equal(invoice.directMoney.total, 100);
  assert.equal(invoice.otaMoney.total, 700);
  assert.equal(invoice.money.total, 800);
});
