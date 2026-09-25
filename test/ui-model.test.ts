import assert from "node:assert/strict";
import { test } from "node:test";
import { ganttBarTone, ganttSections, quoteTotal, rangeOpen, saleTitle, type GanttRow } from "../src/components/room-gantt/model";
import { groupRoomsByType, parseDiscountState, roomAvailabilityTable, roomOpen, roomTypeAvailability } from "../src/components/sale-form/shared";

const room = (id: string, number: string, type: string, floor: number): GanttRow["room"] => ({
  id,
  number,
  type,
  floor,
  opsStatus: "vacant",
});

test("sale-form shared: discount parse, grouping, occupancy", () => {
  assert.deepEqual(parseDiscountState("percent", 10), { kind: "percent", value: "10" });
  assert.deepEqual(parseDiscountState("percent", 150), { kind: "amount", value: "150" });
  const grouped = groupRoomsByType(
    [
      { id: "1", number: "202", type: "Deluxe" },
      { id: "2", number: "101", type: "Standard" },
      { id: "3", number: "102", type: "Standard" },
    ],
    [
      { name: "Standard", sortOrder: 1, baseRate: 1, weekendRate: 1 },
      { name: "Deluxe", sortOrder: 2, baseRate: 1, weekendRate: 1 },
    ],
  );
  assert.deepEqual(
    grouped.map((row) => [row.type, row.rooms.map((item) => item.number)]),
    [
      ["Standard", ["101", "102"]],
      ["Deluxe", ["202"]],
    ],
  );
  assert.equal(
    roomOpen("r1", "2026-09-19", "2026-09-21", [{ roomId: "r1", checkIn: "2026-09-20", checkOut: "2026-09-22" }]),
    false,
  );
  assert.equal(
    roomOpen("r1", "2026-09-19", "2026-09-20", [{ roomId: "r1", checkIn: "2026-09-20", checkOut: "2026-09-22" }]),
    true,
  );
});

test("sale-form shared: room-type availability shows whole stay and each night", () => {
  const rooms = [
    { id: "s1", number: "101", type: "Standard" },
    { id: "s2", number: "102", type: "Standard" },
    { id: "s3", number: "103", type: "Standard", opsStatus: "ooo" },
    { id: "d1", number: "201", type: "Deluxe" },
  ];
  const types = [
    { name: "Standard", sortOrder: 1, baseRate: 1, weekendRate: 1 },
    { name: "Deluxe", sortOrder: 2, baseRate: 1, weekendRate: 1 },
  ];
  const busy = [
    { roomId: "s1", checkIn: "2026-09-20", checkOut: "2026-09-21" },
    { roomId: "s2", checkIn: "2026-09-19", checkOut: "2026-09-20" },
  ];
  const availability = roomTypeAvailability(rooms, types, "2026-09-19", "2026-09-21", busy);

  assert.deepEqual(availability, [
    {
      type: "Standard",
      total: 2,
      available: 0,
      nights: [
        { date: "2026-09-19", available: 1 },
        { date: "2026-09-20", available: 1 },
      ],
    },
    {
      type: "Deluxe",
      total: 1,
      available: 1,
      nights: [
        { date: "2026-09-19", available: 1 },
        { date: "2026-09-20", available: 1 },
      ],
    },
  ]);

  assert.deepEqual(roomAvailabilityTable(rooms, types, "2026-09-19", "2026-09-21", busy), [
    {
      roomId: "s1",
      number: "101",
      type: "Standard",
      nights: [
        { date: "2026-09-19", available: true },
        { date: "2026-09-20", available: false },
      ],
    },
    {
      roomId: "s2",
      number: "102",
      type: "Standard",
      nights: [
        { date: "2026-09-19", available: false },
        { date: "2026-09-20", available: true },
      ],
    },
    {
      roomId: "d1",
      number: "201",
      type: "Deluxe",
      nights: [
        { date: "2026-09-19", available: true },
        { date: "2026-09-20", available: true },
      ],
    },
  ]);
});

test("gantt model: sections, title, quote, open range", () => {
  const rows: GanttRow[] = [
    { room: room("a", "202", "Deluxe", 2), bars: [] },
    {
      room: room("b", "101", "Standard", 1),
      bars: [{ sale: { id: "s1", roomId: "b", guestName: "Hà", status: "reserved", checkIn: "2026-09-19", checkOut: "2026-09-21", rate: 1 }, start: 0, end: 2, nightStart: 0, nightEnd: 2 }],
    },
  ];
  const byFloor = ganttSections(rows, [], "floor");
  assert.deepEqual(
    byFloor.map((section) => section.label),
    ["Tầng 1", "Tầng 2"],
  );
  const byType = ganttSections(rows, [{ name: "Standard", sortOrder: 1, baseRate: 1, weekendRate: 1 }, { name: "Deluxe", sortOrder: 2, baseRate: 1, weekendRate: 1 }], "type");
  assert.equal(byType[0].label, "Standard");
  assert.match(saleTitle({ id: "s", roomId: "b", guestName: "Hà", status: "reserved", checkIn: "2026-09-19", checkOut: "2026-09-21", rate: 1, cars: 1 }), /Hà · .+ · 1 ô tô/);
  assert.match(saleTitle({ id: "s", roomId: "b", guestName: "Nam", status: "departed", checkIn: "2026-09-17", checkOut: "2026-09-19", rate: 1 }), /đã trả phòng/);
  assert.equal(ganttBarTone("reserved"), "reserved");
  assert.equal(ganttBarTone("inhouse"), "inhouse");
  assert.equal(ganttBarTone("departed"), "departed");
  assert.equal(
    quoteTotal({ id: "s", roomId: "b", guestName: "Hà", status: "reserved", checkIn: "2026-09-19", checkOut: "2026-09-21", rate: 1_000_000 }, 1_000_000, "2026-09-19", "2026-09-21"),
    2_000_000,
  );
  assert.equal(rangeOpen(rows[1], 0, 2, "other", 7), false);
  assert.equal(rangeOpen(rows[1], 0, 2, "s1", 7), true);
  assert.equal(rangeOpen({ ...rows[1], room: { ...rows[1].room, opsStatus: "ooo" } }, 3, 1, "s1", 7), false);
});
