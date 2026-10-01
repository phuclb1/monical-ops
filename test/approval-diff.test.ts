import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalChanges } from "../src/lib/booking-approval-diff";

const rooms = new Map([
  ["room-101", "101"],
  ["room-102", "102"],
]);

const before = {
  guestName: "E2E Duyet",
  source: "walk_in",
  deposit: 100000,
  checkinPaid: 0,
  checkinMethod: "",
  cashPaid: 0,
  transferPaid: 100000,
  companyPaid: 0,
  rooms: [
    {
      id: "sale-1",
      roomId: "room-101",
      checkIn: "2026-09-28",
      checkOut: "2026-09-30",
      breakfast: true,
      discountKind: "none",
      discountValue: 0,
    },
  ],
  extras: [{ id: "ex-1", name: "Giặt sấy", qty: 1, unitPrice: 50000 }],
};

test("phiếu duyệt tiền hiện số cũ và số mới", () => {
  const changes = approvalChanges(
    JSON.stringify(before),
    JSON.stringify({
      kind: "booking_update",
      data: {
        deposit: 200000,
        assignments: [
          {
            saleId: "sale-1",
            roomId: "room-101",
            checkIn: "2026-09-28",
            checkOut: "2026-09-30",
            breakfast: true,
            discountKind: "none",
            discountValue: 0,
          },
        ],
      },
    }),
    rooms,
  );
  assert.deepEqual(changes, [{ label: "Đặt cọc", before: "100.000₫", after: "200.000₫" }]);
});

test("phiếu duyệt hiện đổi phòng, ngày và phụ thu", () => {
  const moved = approvalChanges(
    JSON.stringify(before),
    JSON.stringify({
      kind: "move_room",
      data: { saleId: "sale-1", roomId: "room-102", checkIn: "2026-10-01", checkOut: "2026-10-03" },
    }),
    rooms,
  );
  assert.deepEqual(
    moved.map((row) => row.label),
    ["Phòng", "Ngày nhận", "Ngày trả"],
  );
  assert.equal(moved[0]?.after, "P.102");
  assert.equal(moved[1]?.before, "28/09/2026");
  assert.equal(moved[1]?.after, "01/10/2026");

  const added = approvalChanges(
    JSON.stringify(before),
    JSON.stringify({ kind: "add_rooms", roomIds: ["room-102"] }),
    rooms,
  );
  assert.deepEqual(added, [{ label: "Thêm phòng", before: "—", after: "P.102" }]);

  const droppedRoom = approvalChanges(
    JSON.stringify({
      ...before,
      rooms: [
        ...before.rooms,
        {
          id: "sale-2",
          roomId: "room-102",
          checkIn: "2026-09-28",
          checkOut: "2026-09-30",
          breakfast: true,
          discountKind: "none",
          discountValue: 0,
        },
      ],
    }),
    JSON.stringify({
      kind: "booking_update",
      data: {
        removedSaleIds: ["sale-2"],
        assignments: [
          {
            saleId: "sale-1",
            roomId: "room-101",
            checkIn: "2026-09-28",
            checkOut: "2026-09-30",
            breakfast: true,
            discountKind: "none",
            discountValue: 0,
          },
        ],
      },
    }),
    rooms,
  );
  assert.deepEqual(droppedRoom, [{ label: "Xóa phòng", before: "P.102", after: "—" }]);

  const removed = approvalChanges(
    JSON.stringify(before),
    JSON.stringify({ kind: "remove_extra", extraId: "ex-1" }),
    rooms,
  );
  assert.equal(removed[0]?.label, "Xóa phụ thu");
  assert.match(removed[0]?.before || "", /Giặt sấy/);
  assert.equal(removed[0]?.after, "—");
});
