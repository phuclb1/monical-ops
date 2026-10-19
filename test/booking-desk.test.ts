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
  bookingSearchIdsQuery,
  cashPeriodIdsQuery,
  isPhoneUserAgent,
  listPageSize,
  matchesBookingTab,
  pageBounds,
  parsePage,
  summarizeBookingDesk,
} from "../src/lib/booking-desk";

const today = "2026-10-13";

test("booking id lookup stays inside D1's 100 bound parameters", () => {
  const chunk = Array.from({ length: BOOKING_LOOKUP_CHUNK }, (_, index) => `id-${index}`);
  const where = or(inArray(roomSales.bookingId, chunk), inArray(roomSales.id, chunk));
  assert.ok(where);
  const query = new SQLiteSyncDialect().sqlToQuery(where);
  assert.ok(query.params.length <= 100, `${query.params.length} params`);
  assert.equal(BOOKING_LOOKUP_CHUNK, 40);
});

test("phone PWA pages ten rows and desktop pages forty", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
  const desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  assert.equal(isPhoneUserAgent(iphone), true);
  assert.equal(isPhoneUserAgent(android), true);
  assert.equal(isPhoneUserAgent(desktop), false);
  assert.equal(listPageSize(iphone), 10);
  assert.equal(listPageSize(android), 10);
  assert.equal(listPageSize(desktop), 40);
  assert.equal(listPageSize(""), 40);
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

test("booking search SQL stays inside D1's 100 bound parameters", () => {
  const query = bookingSearchIdsQuery("dang tuan 0901222333");
  assert.ok(query);
  const compiled = new SQLiteSyncDialect().sqlToQuery(query);
  assert.ok(compiled.params.length <= 100, `${compiled.params.length} params`);
});

test("booking search SQL finds folded Vietnamese names and compact codes", async () => {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client);
  await client.execute("CREATE TABLE rooms (id TEXT PRIMARY KEY, number TEXT, type TEXT)");
  await client.execute("CREATE TABLE sale_extras (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, name TEXT NOT NULL)");
  await client.execute(`
    CREATE TABLE room_sales (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      room_id TEXT,
      guest_name TEXT NOT NULL,
      guest_phone TEXT,
      origin TEXT NOT NULL DEFAULT 'ops',
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      pms_code TEXT,
      notes TEXT
    )
  `);
  await client.execute({
    sql: "INSERT INTO rooms (id, number, type) VALUES (?, ?, ?)",
    args: ["r1", "101", "Deluxe"],
  });
  await client.execute({
    sql: `INSERT INTO room_sales
      (id, booking_id, room_id, guest_name, guest_phone, origin, source, status, check_in, check_out, pms_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ["s1", "bk-1", "r1", "Đặng Minh Tuấn", "0901 222 333", "ops", "booking", "reserved", "2026-09-20", "2026-09-22", "BK-09-1", "cần hoa"],
  });
  await client.execute({
    sql: "INSERT INTO sale_extras (id, booking_id, name) VALUES (?, ?, ?)",
    args: ["e1", "bk-1", "Thêm đệm"],
  });

  async function ids(query: string) {
    const sqlQuery = bookingSearchIdsQuery(query);
    assert.ok(sqlQuery);
    return (await db.all(sqlQuery)).map((row) => String((row as { bid: string }).bid));
  }

  assert.deepEqual(await ids("dang tuan"), ["bk-1"]);
  assert.deepEqual(await ids("0901222333"), ["bk-1"]);
  assert.deepEqual(await ids("p.101"), ["bk-1"]);
  assert.deepEqual(await ids("them dem"), ["bk-1"]);
  assert.deepEqual(await ids("20/09/2026"), ["bk-1"]);
  assert.deepEqual(await ids("bk091"), ["bk-1"]);
  assert.deepEqual(await ids("hang 101"), []);
});
