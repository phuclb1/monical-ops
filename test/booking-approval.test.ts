import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingChangeRequiresApproval } from "../src/lib/repos/sales/approval";

const booking = {
  source: "walk_in",
  otaPaymentMode: "debt",
  deposit: 100_000,
  cashPaid: 0,
  transferPaid: 100_000,
  companyPaid: 0,
  rooms: [
    {
      id: "sale-1",
      roomId: "room-101",
      checkIn: "2026-09-25",
      checkOut: "2026-09-27",
      breakfast: true,
      discountKind: "none",
      discountValue: 0,
    },
  ],
} as unknown as Parameters<typeof bookingChangeRequiresApproval>[0];

test("ordinary guest detail edits do not require approval", () => {
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [
        {
          saleId: "sale-1",
          roomId: "room-101",
          checkIn: "2026-09-25",
          checkOut: "2026-09-27",
          breakfast: true,
          discountKind: "none",
          discountValue: 0,
        },
      ],
      guestName: "Tên mới",
      notes: "Ghi chú mới",
    }),
    false,
  );
});

test("date, money, room, breakfast and discount edits require approval", () => {
  const base = {
    saleId: "sale-1",
    roomId: "room-101",
    checkIn: "2026-09-25",
    checkOut: "2026-09-27",
    breakfast: true,
    discountKind: "none",
    discountValue: 0,
  };
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [{ ...base, checkOut: "2026-09-28" }],
    }),
    true,
  );
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [{ ...base, discountKind: "percent", discountValue: 10 }],
    }),
    true,
  );
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [base],
      deposit: 200_000,
    }),
    true,
  );
});
