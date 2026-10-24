import assert from "node:assert/strict";
import { test } from "node:test";
import { leanBookingFromRooms } from "../src/lib/repos/sales/queries";
import { bookingDue, computeBookingMoney } from "../src/lib/sales";

function sale(partial: Record<string, unknown> = {}) {
  return {
    id: "s1",
    bookingId: "b1",
    roomId: "r1",
    guestName: "Nguyễn A",
    guestPhone: "090",
    origin: "ops",
    source: "walk_in",
    otaPaymentMode: "debt",
    otaCommissionKind: "percent",
    otaCommissionValue: 0,
    otaCommissionPercent: 0,
    invoiceRequested: false,
    status: "reserved",
    checkIn: "2026-10-20",
    checkOut: "2026-10-22",
    adults: 2,
    children: 0,
    breakfastAdults: null,
    breakfastChildren: null,
    cars: 0,
    bikes: 0,
    rate: 500_000,
    discountKind: "none",
    discountValue: 0,
    deposit: 200_000,
    checkinPaid: 0,
    checkinMethod: "",
    cashPaid: 0,
    transferPaid: 200_000,
    companyPaid: 0,
    refundCash: 0,
    refundTransfer: 0,
    refundCompany: 0,
    refundTotal: 0,
    refundedAt: null,
    refundReason: "",
    bookingTotal: 1_200_000,
    breakfast: true,
    pmsCode: "BK-1",
    notes: "",
    createdAt: "2026-10-01T00:00:00",
    updatedAt: "2026-10-01T00:00:00",
    room: { id: "r1", number: "101", type: "Deluxe", floor: 1, opsStatus: "clean" },
    ...partial,
  };
}

test("lean booking uses stored bookingTotal and due without extras", () => {
  const rooms = [sale({ bookingTotal: 1_200_000, deposit: 200_000, transferPaid: 200_000 })];
  const lean = leanBookingFromRooms("b1", rooms as never);
  assert.equal(lean.total, 1_200_000);
  assert.equal(lean.due, bookingDue(1_200_000, 200_000, 0));
  assert.equal(lean.guestName, "Nguyễn A");
  assert.equal(lean.roomLabel, "P.101");
  assert.equal(lean.extras.length, 0);
});

test("lean booking falls back to computeBookingMoney when bookingTotal is 0", () => {
  const rooms = [sale({ bookingTotal: 0, rate: 500_000, deposit: 0, transferPaid: 0 })];
  const extras = [{ id: "e1", bookingId: "b1", typeId: null, kind: "extra", name: "Đệm", qty: 1, unitPrice: 100_000, unit: "once", createdAt: "2026-10-01T00:00:00", createdBy: null }];
  const lean = leanBookingFromRooms("b1", rooms as never, extras);
  const money = computeBookingMoney(rooms as never, extras);
  assert.equal(lean.total, money.total);
  assert.equal(lean.due, money.due);
  assert.ok(lean.total > 0);
});
