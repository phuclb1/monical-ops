import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDeskBrief, findDeskGuests, type DeskBooking } from "../src/lib/desk-brief";

const today = "2026-11-11";

function stay(partial: Partial<DeskBooking> & Pick<DeskBooking, "id" | "guestName" | "status" | "checkIn" | "checkOut">): DeskBooking {
  return {
    total: 1_000_000,
    due: 0,
    source: "walk_in",
    ...partial,
  };
}

test("desk brief lists arrivals, guests still in house, and month revenue", () => {
  const onDate = [
    stay({
      id: "arrive",
      guestName: "Minh",
      status: "reserved",
      checkIn: today,
      checkOut: "2026-11-13",
      due: 200_000,
      source: "booking",
      roomLabel: "P.305",
    }),
    stay({
      id: "cancel",
      guestName: "Hủy",
      status: "cancelled",
      checkIn: today,
      checkOut: "2026-11-12",
    }),
    stay({
      id: "leave",
      guestName: "An",
      status: "inhouse",
      checkIn: "2026-11-09",
      checkOut: today,
      roomLabel: "P.118",
    }),
  ];
  const inhouse = [
    stay({
      id: "late",
      guestName: "Bình",
      status: "inhouse",
      checkIn: "2026-11-08",
      checkOut: "2026-11-10",
      due: 50_000,
      rooms: [
        { status: "inhouse", room: { number: "104" } },
        { status: "departed", room: { number: "101" } },
      ],
    }),
    stay({
      id: "leave",
      guestName: "An",
      status: "inhouse",
      checkIn: "2026-11-09",
      checkOut: today,
      roomLabel: "P.118",
    }),
  ];
  const month = [
    stay({ id: "arrive", guestName: "Minh", status: "reserved", checkIn: today, checkOut: "2026-11-13", due: 200_000, source: "booking", total: 1_000_000 }),
    stay({ id: "old", guestName: "Cũ", status: "departed", checkIn: "2026-11-02", checkOut: "2026-11-04", total: 2_000_000 }),
    stay({ id: "skip", guestName: "Hủy", status: "cancelled", checkIn: "2026-11-03", checkOut: "2026-11-04", total: 9_000_000 }),
    stay({ id: "next", guestName: "Sau", status: "reserved", checkIn: "2026-12-01", checkOut: "2026-12-02", total: 8_000_000 }),
  ];
  const brief = buildDeskBrief({
    today,
    date: today,
    onDate,
    inhouse,
    month,
    vacantRooms: ["10", "2"],
    occupancy: { rooms: 12, vacant: 2, reserved: 1, inhouse: 2, ooo: 0 },
    query: "104",
  });

  assert.deepEqual(brief.arrivals.map((row) => row.name), ["Minh"]);
  assert.equal(brief.arrivals[0]?.mark, "chưa in");
  assert.equal(brief.arrivals[0]?.source, "Booking.com");
  assert.deepEqual(brief.departures.map((row) => row.name), ["An"]);
  assert.deepEqual(brief.inhouse.map((row) => [row.name, row.room, row.flag]), [
    ["Bình", "104", "late"],
    ["An", "118", "due-out"],
  ]);
  assert.deepEqual(brief.due.map((row) => row.name), ["Minh", "Bình"]);
  assert.deepEqual(brief.vacantRooms, ["2", "10"]);
  assert.equal(brief.revenue.month.count, 2);
  assert.equal(brief.revenue.month.total, 3_000_000);
  assert.equal(brief.revenue.day.total, 1_000_000);
  assert.equal(brief.revenue.month.label, "Tháng 11/2026");
  assert.equal(brief.found[0]?.name, "Bình");
  assert.deepEqual(
    findDeskGuests(brief.inhouse, "an").map((row) => row.name),
    ["An"],
  );
});
