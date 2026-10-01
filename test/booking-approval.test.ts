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

test("changing OTA commission requires approval", () => {
  assert.equal(
    bookingChangeRequiresApproval(
      { ...booking, source: "agoda", otaCommissionKind: "percent", otaCommissionValue: 15 },
      {
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
        otaCommissionKind: "amount",
        otaCommissionValue: 200_000,
      },
    ),
    true,
  );
});

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

test("removing a room requires approval and an unknown id does not", () => {
  const two = {
    ...booking,
    rooms: [
      ...booking.rooms,
      {
        id: "sale-2",
        roomId: "room-102",
        checkIn: "2026-09-25",
        checkOut: "2026-09-27",
        breakfast: true,
        discountKind: "none",
        discountValue: 0,
      },
    ],
  } as typeof booking;
  const kept = {
    saleId: "sale-1",
    roomId: "room-101",
    checkIn: "2026-09-25",
    checkOut: "2026-09-27",
    breakfast: true,
    discountKind: "none",
    discountValue: 0,
  };
  assert.equal(bookingChangeRequiresApproval(two, { assignments: [kept], removedSaleIds: ["sale-2"] }), true);
  assert.equal(bookingChangeRequiresApproval(two, { assignments: [kept], removedSaleIds: [] }), false);
  assert.equal(bookingChangeRequiresApproval(booking, { assignments: [kept], removedSaleIds: ["missing"] }), false);
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
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [base],
      deposit: 100_000,
      checkinPaid: 0,
    }),
    false,
  );
  assert.equal(
    bookingChangeRequiresApproval(booking, {
      assignments: [base],
      deposit: 100_000,
      checkinPaid: 50_000,
    }),
    true,
  );
});
