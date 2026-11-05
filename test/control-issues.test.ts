import assert from "node:assert/strict";
import { test } from "node:test";
import {
  controlPushDue,
  findControlIssues,
  summarizeControlIssues,
  type ControlBooking,
  type ControlIssueKind,
} from "../src/lib/control-issues";

function booking(patch: Partial<ControlBooking> = {}): ControlBooking {
  return {
    id: "bk-1",
    guestName: "Nguyễn Văn A",
    guestPhone: "0901000000",
    pmsCode: "BK-10-1",
    source: "walk_in",
    otaPaymentMode: "hotel",
    total: 1_000_000,
    due: 0,
    roomTotal: 1_000_000,
    extrasTotal: 0,
    deposit: 1_000_000,
    refundTotal: 0,
    checkIn: "2026-11-28",
    checkOut: "2026-11-29",
    rooms: [{
      id: "sale-1",
      roomId: "room-1",
      status: "inhouse",
      checkIn: "2026-11-28",
      checkOut: "2026-11-29",
      checkedInAt: "2026-11-28T12:00:00.000Z",
      room: { number: "101" },
    }],
    transactions: [{ id: "tx-1", kind: "deposit", amount: 1_000_000, method: "company", paidAt: "2026-11-20T03:00:00.000Z" }],
    ...patch,
  };
}

function kinds(rows: ReturnType<typeof findControlIssues>) {
  return rows.map((row) => row.kind);
}

test("detects money and lifecycle issues", () => {
  const rows = findControlIssues([
    booking({
      due: 200_000,
      total: 0,
      deposit: 100_000,
      refundTotal: 250_000,
      checkIn: "2026-11-26",
      checkOut: "2026-11-27",
      rooms: [{
        id: "sale-1",
        roomId: "room-1",
        status: "inhouse",
        checkIn: "2026-11-26",
        checkOut: "2026-11-27",
        checkedInAt: "2026-11-26T03:00:00.000Z",
        room: { number: "101" },
      }],
    }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");

  assert.deepEqual(new Set(kinds(rows)), new Set<ControlIssueKind>([
    "underpaid",
    "checkout_overdue",
    "zero_total",
    "over_refund",
  ]));
});

test("detects overdue arrival and pending approval", () => {
  const row = booking({
    rooms: [{
      id: "sale-1",
      roomId: "room-1",
      status: "reserved",
      checkIn: "2026-11-27",
      checkOut: "2026-11-29",
      room: { number: "101" },
    }],
  });
  const rows = findControlIssues([row], [{
    id: "req-1",
    bookingId: row.id,
    summary: "Đổi ngày nhận",
    requestedAt: "2026-11-28T01:00:00.000Z",
  }], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");

  assert.equal(kinds(rows).includes("arrival_overdue"), true);
  assert.equal(kinds(rows).includes("approval_pending"), true);
});

test("deposit only accepts company transfer", () => {
  for (const method of ["personal", "cash"]) {
    const rows = findControlIssues([
      booking({ transactions: [{ id: `tx-${method}`, kind: "deposit", amount: 300_000, method }] }),
    ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");
    const warning = rows.find((row) => row.kind === "bad_deposit_method");
    assert.ok(warning);
    assert.equal(warning.manualResolve, true);
    assert.match(warning.fingerprint, new RegExp(`tx-${method}$`));
  }

  const accepted = findControlIssues([
    booking({ transactions: [{ id: "tx-company", kind: "deposit", amount: 300_000, method: "company" }] }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");
  assert.equal(accepted.some((row) => row.kind === "bad_deposit_method"), false);
});

test("legacy deposit method is still audited", () => {
  const rows = findControlIssues([
    booking({
      transactions: [],
      deposit: 300_000,
      checkinPaid: 0,
      cashPaid: 0,
      transferPaid: 300_000,
      companyPaid: 0,
    }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");
  assert.equal(rows.some((row) => row.fingerprint === "bad_deposit_method:bk-1:legacy"), true);
});

test("OTA phone warning starts exactly one hour after first check-in", () => {
  const ota = booking({
    source: "agoda",
    otaPaymentMode: "debt",
    guestPhone: "",
    rooms: [{
      id: "sale-1",
      roomId: "room-1",
      status: "inhouse",
      checkIn: "2026-11-28",
      checkOut: "2026-11-29",
      checkedInAt: "2026-11-28T12:00:00.000Z",
      room: { number: "101" },
    }],
  });
  const before = findControlIssues([ota], [], new Date("2026-11-28T12:59:59.999Z"), "2026-11-28");
  const at = findControlIssues([ota], [], new Date("2026-11-28T13:00:00.000Z"), "2026-11-28");
  assert.equal(before.some((row) => row.kind === "ota_phone_missing"), false);
  assert.equal(at.some((row) => row.kind === "ota_phone_missing"), true);
});

test("detects OTA debt separately from guest extras", () => {
  const rows = findControlIssues([
    booking({
      source: "agoda",
      otaPaymentMode: "debt",
      total: 1_100_000,
      due: 1_000_000,
      roomTotal: 1_000_000,
      extrasTotal: 100_000,
      deposit: 100_000,
      rooms: [{
        id: "sale-1",
        roomId: "room-1",
        status: "departed",
        checkIn: "2026-11-25",
        checkOut: "2026-11-27",
        checkedInAt: "2026-11-25T07:00:00.000Z",
        room: { number: "101" },
      }],
      transactions: [{ id: "tx-extra", kind: "payment", amount: 100_000, method: "company" }],
    }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");

  assert.equal(rows.some((row) => row.kind === "underpaid"), false);
  assert.equal(rows.find((row) => row.kind === "ota_unsettled")?.amount, 1_000_000);
});

test("detects overlapping active bookings once", () => {
  const rows = findControlIssues([
    booking(),
    booking({
      id: "bk-2",
      pmsCode: "BK-10-2",
      rooms: [{
        id: "sale-2",
        roomId: "room-1",
        status: "reserved",
        checkIn: "2026-11-28",
        checkOut: "2026-11-30",
        room: { number: "101" },
      }],
    }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");
  assert.equal(rows.filter((row) => row.kind === "room_overlap").length, 1);
});

test("ignores bookings that check in before November 2026", () => {
  const october = booking({
    id: "bk-oct",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    due: 500_000,
    deposit: 0,
    rooms: [{
      id: "sale-oct",
      roomId: "room-1",
      status: "inhouse",
      checkIn: "2026-10-20",
      checkOut: "2026-10-22",
      checkedInAt: "2026-10-20T02:00:00.000Z",
      room: { number: "101" },
    }],
    transactions: [{ id: "tx-oct", kind: "deposit", amount: 200_000, method: "cash" }],
  });
  const september = booking({
    id: "bk-sep",
    checkIn: "2026-09-26",
    checkOut: "2026-09-28",
    due: 400_000,
    rooms: [{
      id: "sale-sep",
      roomId: "room-2",
      status: "departed",
      checkIn: "2026-09-26",
      checkOut: "2026-09-28",
      room: { number: "102" },
    }],
  });
  const november = booking({ id: "bk-nov", due: 100_000 });
  const rows = findControlIssues(
    [october, september, november],
    [{ id: "req-oct", bookingId: "bk-oct", summary: "Sửa giá", requestedAt: "2026-10-21T01:00:00.000Z" }],
    new Date("2026-11-07T14:00:00.000Z"),
    "2026-11-07",
  );
  assert.equal(rows.some((row) => row.bookingId === "bk-oct" || row.bookingId === "bk-sep"), false);
  assert.equal(rows.some((row) => row.bookingId === "bk-nov" && row.kind === "underpaid"), true);
});

test("summary groups issue kinds", () => {
  const rows = findControlIssues([
    booking({ due: 200_000 }),
  ], [], new Date("2026-11-28T14:00:00.000Z"), "2026-11-28");
  assert.match(summarizeControlIssues(rows), /1 thu thiếu tiền/);
});

test("push becomes due at 30 minutes, not before", () => {
  const now = new Date("2026-11-28T14:00:00.000Z");
  assert.equal(controlPushDue(null, now), true);
  assert.equal(controlPushDue("2026-11-28T13:31:00.001Z", now), false);
  assert.equal(controlPushDue("2026-11-28T13:30:00.000Z", now), true);
});
