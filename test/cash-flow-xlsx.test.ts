import assert from "node:assert/strict";
import { test } from "node:test";
import { cashFlowXlsx } from "../src/lib/cash-flow-xlsx";
import { actualCashFlowReport, cashFlowReport, filterActualCashFlow, filterCashFlowReport } from "../src/lib/sales-report";

test("cash flow workbook is an xlsx with booking rows and refund amounts", () => {
  const report = cashFlowReport(
    [
      {
        id: "bk-1",
        guestName: "Mai & Hà",
        pmsCode: "BK-09",
        source: "walk_in",
        createdAt: "2026-09-01T10:00:00.000Z",
        checkIn: "2026-09-10",
        checkOut: "2026-09-11",
        status: "reserved",
        total: 1_080_000,
        due: 480_000,
        deposit: 600_000,
        cashPaid: 200_000,
        transferPaid: 300_000,
        companyPaid: 100_000,
      },
      {
        id: "bk-2",
        guestName: "Hoàn cọc",
        pmsCode: null,
        source: "phone",
        createdAt: "2026-09-02T10:00:00.000Z",
        checkIn: "2026-08-01",
        checkOut: "2026-08-02",
        status: "cancelled",
        total: 0,
        due: 0,
        deposit: 0,
        refundCash: 50_000,
        refundedAt: "2026-09-12",
      },
    ],
    "2026-09-01",
    "2026-10-01",
    "2026-09-12",
  );
  const actual = actualCashFlowReport(report.rows.map(({ booking }) => booking), "2026-09-01", "2026-10-01");
  const bytes = cashFlowXlsx(report, actual);
  const text = Buffer.from(bytes).toString("utf8");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /Mai &amp; Hà/);
  assert.match(text, /BK-09/);
  assert.match(text, /Hoàn cọc/);
  assert.match(text, /<v>-50000<\/v>/);
  assert.match(text, /<v>1080000<\/v>/);
  assert.match(text, /Dòng tiền/);
  assert.match(text, /Thực tế/);
  assert.match(text, /Đặt cọc/);
  assert.match(text, /sheet2\.xml/);
});

test("cash flow workbook can export a filtered actual sheet", () => {
  const report = cashFlowReport(
    [
      {
        id: "bk-1",
        guestName: "Mai Hà",
        pmsCode: "BK-09",
        source: "walk_in",
        createdAt: "2026-09-01T10:00:00.000Z",
        checkIn: "2026-09-10",
        checkOut: "2026-09-12",
        status: "reserved",
        total: 600_000,
        due: 0,
        deposit: 200_000,
        transferPaid: 200_000,
      },
      {
        id: "bk-2",
        guestName: "Đặng Minh Tuấn",
        pmsCode: "BK-10",
        source: "phone",
        createdAt: "2026-09-02T10:00:00.000Z",
        checkIn: "2026-09-11",
        checkOut: "2026-09-13",
        status: "inhouse",
        total: 800_000,
        due: 0,
        deposit: 400_000,
        cashPaid: 400_000,
      },
    ],
    "2026-09-01",
    "2026-10-01",
  );
  const filter = { q: "BK-10" };
  const filtered = filterCashFlowReport(report, filter);
  const actual = filterActualCashFlow(actualCashFlowReport(report.rows.map(({ booking }) => booking), "2026-09-01", "2026-10-01"), filter);
  const text = Buffer.from(cashFlowXlsx(filtered, actual)).toString("utf8");
  assert.match(text, /Đặng Minh Tuấn/);
  assert.match(text, /BK-10/);
  assert.doesNotMatch(text, /Mai Hà/);
});
