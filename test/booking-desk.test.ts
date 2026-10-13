import { or, inArray } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { roomSales } from "../src/db/schema/sales";
import { BOOKING_LOOKUP_CHUNK } from "../src/lib/repos/sales/queries";
import {
  bookingDeskCountQuery,
  bookingDeskPageQuery,
  cashPeriodIdsQuery,
  matchesBookingTab,
  pageBounds,
  parsePage,
  summarizeBookingDesk,
} from "../src/lib/booking-desk";

const today = "2026-10-13";

test("booking id lookup stays inside D1's 100 bound parameters", () => {
  const chunk = Array.from({ length: BOOKING_LOOKUP_CHUNK }, (_, index) => `id-${index}`);
  const where = or(inArray(roomSales.bookingId, chunk), inArray(roomSales.id, chunk));
  const query = new SQLiteSyncDialect().sqlToQuery(where);
  assert.ok(query.params.length <= 100, `${query.params.length} params`);
  assert.equal(BOOKING_LOOKUP_CHUNK, 40);
});

test("page bounds clamp to the last page", () => {
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("nope"), 1);
  assert.deepEqual(pageBounds(0, 4, 40), { page: 1, pages: 1, start: 0, take: 0, total: 0, from: 0, to: 0 });
  assert.deepEqual(pageBounds(41, 9, 40), { page: 2, pages: 2, start: 40, take: 1, total: 41, from: 41, to: 41 });
});

test("desk summary keeps tab counts inside the view and view counts inside the tab", () => {
  const rows = [
    { id: "b-new", status: "reserved", createdAt: "2026-10-12T01:00:00", checkIn: "2026-11-01", checkOut: "2026-11-02", rooms: [{ status: "reserved", checkIn: "2026-11-01", checkOut: "2026-11-02" }] },
    { id: "b-in", status: "inhouse", createdAt: "2026-10-01T01:00:00", checkIn: today, checkOut: "2026-10-15", rooms: [{ status: "inhouse", checkIn: today, checkOut: "2026-10-15" }] },
    { id: "b-out", status: "departed", createdAt: "2026-09-01T01:00:00", checkIn: "2026-10-10", checkOut: today, rooms: [{ status: "departed", checkIn: "2026-10-10", checkOut: today }] },
    { id: "b-cancel", status: "cancelled", createdAt: "2026-08-01T01:00:00", checkIn: today, checkOut: "2026-10-14", rooms: [{ status: "cancelled", checkIn: today, checkOut: "2026-10-14" }] },
  ];
  const summary = summarizeBookingDesk(rows, "open", "checkin", today);
  assert.equal(matchesBookingTab("departed", "open"), true);
  assert.deepEqual(summary.counts, { open: 1, reserved: 0, inhouse: 1, done: 0, all: 1 });
  assert.deepEqual(summary.viewCounts, { new: 3, checkin: 1, checkout: 1 });
  assert.deepEqual(summary.list.map((row) => row.id), ["b-in"]);
});

test("booking desk SQL pages by rolled-up status and created time", async () => {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client);
  await client.execute(`
    CREATE TABLE room_sales (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      status TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      created_at TEXT NOT NULL,
      refund_cash INTEGER DEFAULT 0,
      refund_transfer INTEGER DEFAULT 0,
      refund_company INTEGER DEFAULT 0,
      refunded_at TEXT
    )
  `);
  const lines = [
    ["s1", "b-old", "departed", "2026-09-01", "2026-09-02", "2026-08-01T00:00:00"],
    ["s2", "b-new", "reserved", "2026-11-01", "2026-11-03", "2026-10-12T00:00:00"],
    ["s3", "b-mix", "reserved", "2026-10-20", "2026-10-22", "2026-10-02T00:00:00"],
    ["s4", "b-mix", "inhouse", today, "2026-10-16", "2026-10-03T00:00:00"],
    ["s5", "", "cancelled", today, "2026-10-14", "2026-07-01T00:00:00"],
    ["seq-hold-1", "", "reserved", today, "2026-10-14", "2026-10-13T00:00:00"],
    ["s6", "b-out", "departed", "2026-10-10", today, "2026-09-01T00:00:00"],
  ] as const;
  for (const [id, bookingId, status, checkIn, checkOut, createdAt] of lines) {
    await client.execute({
      sql: "INSERT INTO room_sales (id, booking_id, status, check_in, check_out, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, bookingId, status, checkIn, checkOut, createdAt],
    });
  }
  await client.execute({
    sql: "UPDATE room_sales SET refund_cash = 100000, refunded_at = ? WHERE id = ?",
    args: ["2026-10-05T08:00:00", "s1"],
  });

  const counts = (await db.all(bookingDeskCountQuery(today, "new", "open")))[0] as {
    open_count: number;
    reserved_count: number;
    inhouse_count: number;
    done_count: number;
    all_count: number;
    view_new: number;
    view_checkin: number;
    view_checkout: number;
    list_count: number;
  };
  assert.equal(Number(counts.open_count), 4);
  assert.equal(Number(counts.reserved_count), 1);
  assert.equal(Number(counts.inhouse_count), 1);
  assert.equal(Number(counts.done_count), 3);
  assert.equal(Number(counts.all_count), 5);
  assert.equal(Number(counts.view_new), 4);
  assert.equal(Number(counts.view_checkin), 1);
  assert.equal(Number(counts.view_checkout), 1);
  assert.equal(Number(counts.list_count), 4);

  const page = await db.all(bookingDeskPageQuery(today, "new", "open", 2, 0));
  assert.deepEqual(
    page.map((row) => String((row as { bid: string }).bid)),
    ["b-new", "b-mix"],
  );
  const checkin = await db.all(bookingDeskPageQuery(today, "checkin", "open", 10, 0));
  assert.deepEqual(
    checkin.map((row) => String((row as { bid: string }).bid)),
    ["b-mix"],
  );

  const cash = await db.all(cashPeriodIdsQuery("2026-10-01", "2026-11-01"));
  assert.deepEqual(
    cash.map((row) => String((row as { bid: string }).bid)).sort(),
    ["b-mix", "b-old", "b-out"].sort(),
  );
});
