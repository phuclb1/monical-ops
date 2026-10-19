import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNTING_NAV, homePath, isAccountingAllowedPath, isAccountingPath, MANAGER_NAV, sidebarNav } from "../src/lib/nav";
import { datesUntil } from "../src/lib/datetime";
import { actualCashFlowReport, cashFlowReport, filterActualCashFlow, filterCashFlowReport, invoiceRevenueReport, revenueTrend, roomPerformanceSummary, roomRevenueReport } from "../src/lib/sales-report";

function row(partial: {
  checkIn: string;
  checkOut: string;
  status: string;
  total?: number;
  due?: number;
  source?: string;
  invoiceRequested?: boolean;
  otaPaymentMode?: "debt" | "hotel";
  otaCommissionPercent?: number;
  otaCommissionKind?: "percent" | "amount";
  otaCommissionValue?: number;
  cashPaid?: number;
  transferPaid?: number;
  companyPaid?: number;
  refundCash?: number;
  refundTransfer?: number;
  refundCompany?: number;
  refundedAt?: string;
}) {
  return {
    checkIn: partial.checkIn,
    checkOut: partial.checkOut,
    status: partial.status,
    total: partial.total ?? 1_000_000,
    due: partial.due ?? 0,
    deposit: (partial.cashPaid || 0) + (partial.transferPaid || 0) + (partial.companyPaid || 0),
    cashPaid: partial.cashPaid,
    transferPaid: partial.transferPaid,
    companyPaid: partial.companyPaid,
    refundCash: partial.refundCash,
    refundTransfer: partial.refundTransfer,
    refundCompany: partial.refundCompany,
    refundedAt: partial.refundedAt,
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
  assert.deepEqual(manage, {
    kind: "group",
    label: "Quản lý",
    items: [
      { href: "/reports", label: "Báo cáo" },
      { href: "/expenses", label: "Chi phí" },
    ],
  });
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
  assert.equal(ACCOUNTING_NAV.some((item) => item.href === "/sales/bookings"), true);
  assert.equal(isAccountingPath("/accounting"), true);
  assert.equal(isAccountingPath("/accounting/anything"), true);
  assert.equal(isAccountingPath("/reports"), false);
  assert.equal(isAccountingAllowedPath("/sales"), true);
  assert.equal(isAccountingAllowedPath("/sales/bookings"), true);
  assert.equal(isAccountingAllowedPath("/sales/bookings/bk-1"), true);
  assert.equal(isAccountingAllowedPath("/sales/bookings/bk-1/print"), false);
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

test("cash flow splits inclusive VAT and OTA receivable or hotel commission payable", () => {
  const report = cashFlowReport(
    [
      row({
        checkIn: "2026-09-10",
        checkOut: "2026-09-11",
        status: "reserved",
        total: 1_080_000,
        due: 480_000,
        source: "walk_in",
        cashPaid: 200_000,
        transferPaid: 300_000,
        companyPaid: 100_000,
      }),
      row({
        checkIn: "2026-09-11",
        checkOut: "2026-09-12",
        status: "reserved",
        total: 1_080_000,
        source: "agoda",
        otaPaymentMode: "debt",
        otaCommissionPercent: 15,
        cashPaid: 50_000,
      }),
      row({
        checkIn: "2026-09-12",
        checkOut: "2026-09-13",
        status: "inhouse",
        total: 2_000_000,
        due: 500_000,
        source: "booking",
        otaPaymentMode: "hotel",
        otaCommissionKind: "amount",
        otaCommissionValue: 300_000,
        companyPaid: 1_500_000,
      }),
      row({ checkIn: "2026-09-20", checkOut: "2026-09-21", status: "reserved", total: 108_000, source: "phone" }),
      row({ checkIn: "2026-09-08", checkOut: "2026-09-09", status: "cancelled", total: 1_080_000, source: "walk_in" }),
      row({ checkIn: "2026-09-14", checkOut: "2026-09-15", status: "no_show", total: 1_080_000, source: "walk_in" }),
      row({ checkIn: "2026-08-31", checkOut: "2026-09-02", status: "departed", total: 1_080_000, source: "walk_in" }),
    ],
    "2026-09-01",
    "2026-10-01",
    "2026-09-12",
  );

  assert.equal(report.rows.length, 4);
  assert.equal(report.totals.count, 4);
  assert.equal(report.totals.recognizedCount, 3);
  assert.deepEqual(
    report.rows.map((item) => item.flow.kind),
    ["direct", "ota_debt", "ota_hotel", "direct"],
  );
  assert.equal(report.rows[0].flow.vat, 80_000);
  assert.equal(report.rows[0].flow.net, 1_000_000);
  assert.equal(report.rows[0].flow.cash, 200_000);
  assert.equal(report.rows[0].flow.transfer, 300_000);
  assert.equal(report.rows[0].flow.company, 100_000);
  assert.equal(report.rows[0].flow.receivable, 0);
  assert.equal(report.rows[0].flow.payable, 0);
  assert.equal(report.rows[0].flow.guestDue, 480_000);
  assert.equal(report.rows[1].flow.cash, 0);
  assert.equal(report.rows[1].flow.receivable, 918_000);
  assert.equal(report.rows[1].flow.withheld, 162_000);
  assert.equal(report.rows[1].flow.payable, 0);
  assert.equal(report.rows[1].flow.guestDue, 0);
  assert.equal(report.rows[2].flow.company, 1_500_000);
  assert.equal(report.rows[2].flow.receivable, 0);
  assert.equal(report.rows[2].flow.withheld, 0);
  assert.equal(report.rows[2].flow.payable, 300_000);
  assert.equal(report.rows[2].flow.guestDue, 500_000);
  assert.equal(report.rows[3].flow.recognized, false);
  assert.equal(report.rows[3].flow.vat, 8_000);
  assert.equal(report.totals.vat, 80_000 + 80_000 + Math.round((2_000_000 * 8) / 108) + 8_000);
  assert.equal(report.totals.cash, 200_000);
  assert.equal(report.totals.transfer, 300_000);
  assert.equal(report.totals.company, 1_600_000);
  assert.equal(report.totals.receivable, 918_000);
  assert.equal(report.totals.withheld, 162_000);
  assert.equal(report.totals.payable, 300_000);
  assert.equal(report.totals.guestDue, 980_000);
  assert.equal(report.totals.refundCount, 0);
});

test("cash flow records a deposit refund on the account and date it was returned", () => {
  const report = cashFlowReport(
    [
      row({
        checkIn: "2026-09-10",
        checkOut: "2026-09-11",
        status: "reserved",
        source: "walk_in",
        transferPaid: 300_000,
      }),
      row({
        checkIn: "2026-10-20",
        checkOut: "2026-10-21",
        status: "cancelled",
        source: "phone",
        transferPaid: 500_000,
        refundTransfer: 500_000,
        refundedAt: "2026-09-02",
      }),
      row({
        checkIn: "2026-09-03",
        checkOut: "2026-09-04",
        status: "cancelled",
        source: "walk_in",
        refundCash: 100_000,
        refundedAt: "2026-08-01",
      }),
    ],
    "2026-09-01",
    "2026-10-01",
    "2026-09-12",
  );

  assert.equal(report.totals.count, 1);
  assert.equal(report.totals.refundCount, 1);
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[1].flow.refund, true);
  assert.equal(report.rows[1].flow.gross, 0);
  assert.equal(report.rows[1].flow.transfer, -500_000);
  assert.equal(report.rows[1].flow.cash, 0);
  assert.equal(report.totals.transfer, 300_000 - 500_000);
});

test("actual cash flow lists each collected payment and can group by booking", () => {
  const report = actualCashFlowReport(
    [
      {
        id: "bk-1",
        guestName: "Mai Hà",
        pmsCode: "BK-09",
        roomLabel: "P.101 · P.102",
        checkIn: "2026-09-10",
        checkOut: "2026-09-12",
        status: "inhouse",
        total: 1_450_000,
        due: 0,
        deposit: 1_000_000,
        checkinPaid: 500_000,
        checkinMethod: "cash",
        cashPaid: 500_000,
        transferPaid: 500_000,
        companyPaid: 0,
        extras: [{ id: "ex-1", name: "Phụ thu người lớn", amount: 300_000 }],
      },
      {
        id: "bk-2",
        guestName: "Hoàn cọc",
        roomLabel: "P.201",
        checkIn: "2026-10-20",
        checkOut: "2026-10-21",
        status: "cancelled",
        total: 0,
        due: 0,
        deposit: 0,
        refundTransfer: 200_000,
        refundedAt: "2026-09-05",
      },
      {
        id: "bk-3",
        guestName: "OTA công nợ",
        checkIn: "2026-09-11",
        checkOut: "2026-09-12",
        status: "reserved",
        total: 1_000_000,
        due: 0,
        deposit: 0,
        source: "agoda",
        otaPaymentMode: "debt",
      },
    ],
    "2026-09-01",
    "2026-10-01",
  );

  assert.deepEqual(
    report.rows.map((item) => [item.bookingCode, item.typeLabel, item.amount, item.method]),
    [
      ["BK-09", "Đặt cọc", 500_000, "personal"],
      ["BK-09", "Thu đủ", 200_000, "cash"],
      ["BK-09", "Phụ thu người lớn", 300_000, "cash"],
      ["bk-2", "Hoàn cọc", -200_000, "personal"],
    ],
  );
  assert.equal(report.rows[0].guestName, "Mai Hà");
  assert.equal(report.rows[0].roomLabel, "P.101 · P.102");
  assert.equal(report.rows[0].checkIn, "2026-09-10");
  assert.equal(report.rows[0].checkOut, "2026-09-12");
  assert.equal(report.totals.count, 4);
  assert.equal(report.totals.bookingCount, 2);
  assert.equal(report.totals.inflow, 1_000_000);
  assert.equal(report.totals.refund, -200_000);
  assert.equal(report.totals.cash, 500_000);
  assert.equal(report.totals.transfer, 300_000);
  assert.equal(report.groups.length, 2);
  assert.equal(report.groups[0].rows.length, 3);
  assert.equal(report.groups[0].amount, 1_000_000);
  assert.equal(report.groups[1].amount, -200_000);
});

test("actual cash flow filters by guest, booking code and stay dates", () => {
  const report = actualCashFlowReport(
    [
      {
        id: "bk-1",
        guestName: "Mai Hà",
        pmsCode: "BK-09",
        roomLabel: "P.101",
        checkIn: "2026-09-10",
        checkOut: "2026-09-12",
        status: "inhouse",
        total: 1_000_000,
        due: 0,
        deposit: 500_000,
        transferPaid: 500_000,
      },
      {
        id: "bk-2",
        guestName: "Đặng Minh Tuấn",
        pmsCode: "BK-10",
        roomLabel: "P.401",
        checkIn: "2026-09-11",
        checkOut: "2026-09-13",
        status: "inhouse",
        total: 1_200_000,
        due: 0,
        deposit: 400_000,
        cashPaid: 400_000,
      },
    ],
    "2026-09-01",
    "2026-10-01",
  );

  const byName = filterActualCashFlow(report, { q: "mai ha" });
  assert.deepEqual(byName.rows.map((row) => row.bookingCode), ["BK-09"]);
  assert.equal(byName.totals.bookingCount, 1);
  assert.equal(byName.totals.amount, 500_000);

  const byCode = filterActualCashFlow(report, { q: "BK-10" });
  assert.deepEqual(byCode.rows.map((row) => row.guestName), ["Đặng Minh Tuấn"]);

  const byArrive = filterActualCashFlow(report, { arrive: "2026-09-11" });
  assert.equal(byArrive.rows.length, 1);
  assert.equal(byArrive.rows[0].bookingCode, "BK-10");

  const byStay = filterActualCashFlow(report, { arrive: "2026-09-10", depart: "2026-09-12" });
  assert.equal(byStay.rows[0].guestName, "Mai Hà");
  assert.equal(filterActualCashFlow(report, { arrive: "2026-09-10", depart: "2026-09-13" }).rows.length, 0);
});

test("cash flow summary filter keeps matching booking rows", () => {
  const report = cashFlowReport(
    [
      { id: "bk-1", guestName: "Mai Hà", pmsCode: "BK-09", checkIn: "2026-09-10", checkOut: "2026-09-12", status: "reserved", total: 100, due: 0, deposit: 0 },
      { id: "bk-2", guestName: "Đặng", checkIn: "2026-09-11", checkOut: "2026-09-13", status: "inhouse", total: 200, due: 0, deposit: 0 },
    ],
    "2026-09-01",
    "2026-10-01",
  );
  const filtered = filterCashFlowReport(report, { q: "BK-09", arrive: "2026-09-10" });
  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.rows[0].booking.guestName, "Mai Hà");
  assert.equal(filtered.totals.count, 1);
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
