import assert from "node:assert/strict";
import { test } from "node:test";
import { openAvailability, parseOpenAvailabilityQuery } from "../src/lib/open-availability";

const rooms = [
  { id: "s1", number: "101", type: "STANDARD" },
  { id: "s2", number: "102", type: "STANDARD" },
  { id: "s3", number: "103", type: "STANDARD", opsStatus: "ooo" },
  { id: "d1", number: "201", type: "DELUXE" },
];
const types = [
  { name: "STANDARD", code: "standard", sortOrder: 1, baseRate: 1, weekendRate: 1 },
  { name: "DELUXE", code: "deluxe", sortOrder: 2, baseRate: 1, weekendRate: 1 },
  { name: "VIP", code: "vip", sortOrder: 3, baseRate: 1, weekendRate: 1 },
];
const busy = [
  { roomId: "s1", checkIn: "2026-10-31", checkOut: "2026-11-01" },
  { roomId: "s2", checkIn: "2026-10-30", checkOut: "2026-10-31" },
];

test("availability query: một ngày, alias, và trần 62 đêm", () => {
  assert.deepEqual(parseOpenAvailabilityQuery(new URLSearchParams("date=2026-10-30")), {
    from: "2026-10-30",
    to: "2026-10-31",
    type: "",
  });
  assert.deepEqual(parseOpenAvailabilityQuery(new URLSearchParams("checkIn=2026-10-30&checkOut=2026-11-01&roomType=deluxe")), {
    from: "2026-10-30",
    to: "2026-11-01",
    type: "deluxe",
  });
  assert.throws(() => parseOpenAvailabilityQuery(new URLSearchParams("from=30-10-2026")), /YYYY-MM-DD/);
  assert.throws(() => parseOpenAvailabilityQuery(new URLSearchParams("from=2026-11-02&to=2026-11-01")), /sau ngày nhận/);
  assert.throws(() => parseOpenAvailabilityQuery(new URLSearchParams("from=2026-10-01&to=2026-12-15")), /62 đêm/);
});

test("availability: phòng trống theo đêm và cả kỳ, bỏ OOO", () => {
  const result = openAvailability({ rooms, types, busy, from: "2026-10-30", to: "2026-11-01" });
  assert.deepEqual(result.types.map((row) => ({ type: row.type, available: row.available, rooms: row.rooms, nights: row.nights })), [
    {
      type: "STANDARD",
      available: 0,
      rooms: [],
      nights: [
        { date: "2026-10-30", available: 1, total: 2, rooms: ["101"] },
        { date: "2026-10-31", available: 1, total: 2, rooms: ["102"] },
      ],
    },
    {
      type: "DELUXE",
      available: 1,
      rooms: ["201"],
      nights: [
        { date: "2026-10-30", available: 1, total: 1, rooms: ["201"] },
        { date: "2026-10-31", available: 1, total: 1, rooms: ["201"] },
      ],
    },
  ]);
  assert.equal(result.types[1]?.code, "deluxe");
});

test("availability: lọc hạng phòng theo tên hoặc mã", () => {
  const deluxe = openAvailability({ rooms, types, busy, from: "2026-10-30", to: "2026-10-31", type: "deluxe" });
  assert.deepEqual(
    deluxe.types.map((row) => row.type),
    ["DELUXE"],
  );
  const vip = openAvailability({ rooms, types, busy, from: "2026-10-30", to: "2026-10-31", type: "VIP" });
  assert.equal(vip.types[0]?.available, 0);
  assert.deepEqual(vip.types[0]?.rooms, []);
  assert.throws(() => openAvailability({ rooms, types, busy, from: "2026-10-30", to: "2026-10-31", type: "SUITE" }), /hạng phòng/);
});
