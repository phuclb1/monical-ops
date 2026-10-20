import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backfillTxsForBooking,
  canSettleOtaDebt,
  groupSalesForBackfill,
  projectBookingPaid,
} from "../src/lib/sales";

test("unpaid booking backfills zero transactions", () => {
  assert.deepEqual(
    backfillTxsForBooking([
      {
        id: "s1",
        bookingId: "bk-1",
        source: "walk_in",
        deposit: 0,
        checkinPaid: 0,
        createdAt: "2026-10-01T03:00:00.000Z",
        checkIn: "2026-10-10",
      },
    ]),
    [],
  );
});

test("direct booking backfills deposit and checkin", () => {
  const rows = backfillTxsForBooking([
    {
      id: "s1",
      bookingId: "bk-1",
      source: "walk_in",
      deposit: 1_500_000,
      checkinPaid: 500_000,
      checkinMethod: "cash",
      transferPaid: 1_000_000,
      cashPaid: 500_000,
      createdAt: "2026-10-01T03:00:00.000Z",
      createdBy: "u1",
      checkIn: "2026-10-10",
      checkedInAt: "2026-10-10T03:15:00.000Z",
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, "deposit");
  assert.equal(rows[0].amount, 1_000_000);
  assert.equal(rows[0].paidAt, "2026-10-01T03:00:00.000Z");
  assert.equal(rows[1].kind, "checkin");
  assert.equal(rows[1].amount, 500_000);
  assert.equal(rows[1].method, "cash");
});

test("OTA debt unpaid stays empty; paid OTA becomes one ota row", () => {
  assert.equal(
    backfillTxsForBooking([
      {
        id: "s1",
        bookingId: "bk-ota",
        source: "agoda",
        otaPaymentMode: "debt",
        deposit: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
        checkIn: "2026-09-10",
      },
    ]).length,
    0,
  );
  const paid = backfillTxsForBooking([
    {
      id: "s1",
      bookingId: "bk-ota",
      source: "agoda",
      otaPaymentMode: "debt",
      deposit: 2_000_000,
      companyPaid: 2_000_000,
      createdAt: "2026-09-01T00:00:00.000Z",
      checkedOutAt: "2026-09-12T05:00:00.000Z",
      checkIn: "2026-09-10",
    },
  ]);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].kind, "ota");
  assert.equal(paid[0].amount, 2_000_000);
  assert.equal(paid[0].method, "company");
});

test("dirty method split does not double collected deposit", () => {
  const rows = backfillTxsForBooking([
    {
      id: "s1",
      bookingId: "sale-stg-sep-bdc",
      source: "booking",
      otaPaymentMode: "hotel",
      deposit: 3_600_000,
      checkinPaid: 3_600_000,
      transferPaid: 3_600_000,
      companyPaid: 3_600_000,
      createdAt: "2026-09-11T02:00:00.000Z",
      checkIn: "2026-09-11",
    },
  ]);
  const inflow = rows.filter((row) => row.kind !== "refund").reduce((sum, row) => sum + row.amount, 0);
  assert.equal(inflow, 3_600_000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "checkin");
  assert.equal(rows[0].amount, 3_600_000);
});

test("refund buckets become refund txs", () => {
  const rows = backfillTxsForBooking([
    {
      id: "s1",
      source: "phone",
      deposit: 300_000,
      transferPaid: 300_000,
      refundTransfer: 300_000,
      refundedAt: "2026-10-05",
      createdAt: "2026-10-01T00:00:00.000Z",
      checkIn: "2026-10-20",
    },
  ]);
  assert.equal(rows.some((row) => row.kind === "refund" && row.amount === 300_000 && row.method === "personal"), true);
});

test("multi-room group uses bookingKey and one money snapshot", () => {
  const groups = groupSalesForBackfill([
    { id: "s1", bookingId: "bk", deposit: 100_000, transferPaid: 100_000, createdAt: "2026-10-01T00:00:00.000Z", checkIn: "2026-10-10", source: "walk_in" },
    { id: "s2", bookingId: "bk", deposit: 100_000, transferPaid: 100_000, createdAt: "2026-10-01T00:00:00.000Z", checkIn: "2026-10-10", source: "walk_in" },
    { id: "lone", bookingId: null, deposit: 0, createdAt: "2026-10-01T00:00:00.000Z", checkIn: "2026-10-11", source: "walk_in" },
  ]);
  assert.equal(groups.get("bk")?.length, 2);
  assert.equal(backfillTxsForBooking(groups.get("bk") || []).length, 1);
  assert.equal(backfillTxsForBooking(groups.get("lone") || []).length, 0);
});

test("projectBookingPaid sums inflows and refunds", () => {
  const paid = projectBookingPaid([
    { kind: "deposit", amount: 500_000, method: "personal" },
    { kind: "payment", amount: 200_000, method: "cash" },
    { kind: "ota", amount: 1_000_000, method: "company" },
    { kind: "refund", amount: 100_000, method: "personal", paidOn: "2026-10-08" },
  ]);
  assert.equal(paid.deposit, 1_700_000);
  assert.equal(paid.checkinPaid, 1_200_000);
  assert.equal(paid.cashPaid, 200_000);
  assert.equal(paid.transferPaid, 500_000);
  assert.equal(paid.companyPaid, 1_000_000);
  assert.equal(paid.refundTransfer, 100_000);
  assert.equal(paid.refundTotal, 100_000);
  assert.equal(paid.refundedAt, "2026-10-08");
  assert.equal(paid.checkinMethod, "company");
});

test("canSettleOtaDebt only after full checkout with remaining due", () => {
  const base = { source: "agoda", otaPaymentMode: "debt", due: 1_200_000 };
  assert.equal(canSettleOtaDebt({ ...base, rooms: [{ status: "reserved" }] }), false);
  assert.equal(canSettleOtaDebt({ ...base, rooms: [{ status: "inhouse" }] }), false);
  assert.equal(canSettleOtaDebt({ ...base, rooms: [{ status: "departed" }, { status: "reserved" }] }), false);
  assert.equal(canSettleOtaDebt({ ...base, due: 0, rooms: [{ status: "departed" }] }), false);
  assert.equal(canSettleOtaDebt({ ...base, rooms: [{ status: "cancelled" }] }), false);
  assert.equal(canSettleOtaDebt({ ...base, rooms: [{ status: "departed" }, { status: "cancelled" }] }), true);
  assert.equal(canSettleOtaDebt({ source: "walk_in", due: 100, rooms: [{ status: "departed" }] }), false);
});
