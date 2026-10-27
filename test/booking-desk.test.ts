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
  bookingSearchCountQuery,
  bookingSearchIdsQuery,
  bookingSearchPageQuery,
  cashPeriodIdsQuery,
  isPhoneUserAgent,
  listPageSize,
  matchesBookingTab,
  normalizeBookingDeskTab,
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
    { id: "b-leave", status: "inhouse", createdAt: "2026-10-11T01:00:00", checkIn: "2026-10-10", checkOut: today, rooms: [{ status: "inhouse", checkIn: "2026-10-10", checkOut: today }] },
    { id: "b-tmr", status: "reserved", createdAt: "2026-10-13T02:00:00", checkIn: "2026-10-14", checkOut: "2026-10-16", rooms: [{ status: "reserved", checkIn: "2026-10-14", checkOut: "2026-10-16" }] },
    { id: "b-out", status: "departed", createdAt: "2026-09-01T01:00:00", checkIn: "2026-10-10", checkOut: today, rooms: [{ status: "departed", checkIn: "2026-10-10", checkOut: today }] },
    { id: "b-cancel", status: "cancelled", createdAt: "2026-08-01T01:00:00", checkIn: today, checkOut: "2026-10-14", rooms: [{ status: "cancelled", checkIn: today, checkOut: "2026-10-14" }] },
  ];
  const summary = summarizeBookingDesk(rows, "active", "checkin", today);
  assert.equal(matchesBookingTab("departed", "active"), false);
  assert.equal(matchesBookingTab("reserved", "active"), true);
  assert.equal(normalizeBookingDeskTab("open"), "active");
  assert.equal(normalizeBookingDeskTab("done"), "active");
  assert.equal(normalizeBookingDeskTab("inhouse"), "inhouse");
  assert.deepEqual(summary.counts, { active: 1, reserved: 0, inhouse: 1 });
  assert.deepEqual(summary.viewCounts, { new: 4, month: 3, checkin: 1, stay: 1, checkout: 1, tomorrow: 1 });
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
    ["s7", "b-tmr", "reserved", "2026-10-14", "2026-10-16", "2026-10-13T01:00:00"],
    ["s8", "b-leave", "inhouse", "2026-10-10", today, "2026-10-01T00:00:00"],
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

  const counts = (await db.all(bookingDeskCountQuery(today, "new", "active")))[0] as {
    active_count: number;
    reserved_count: number;
    inhouse_count: number;
    view_new: number;
    view_month: number;
    view_checkin: number;
    view_stay: number;
    view_checkout: number;
    view_tomorrow: number;
    list_count: number;
  };
  assert.equal(Number(counts.active_count), 4);
  assert.equal(Number(counts.reserved_count), 2);
  assert.equal(Number(counts.inhouse_count), 2);
  assert.equal(Number(counts.view_new), 4);
  assert.equal(Number(counts.view_month), 3);
  assert.equal(Number(counts.view_checkin), 1);
  assert.equal(Number(counts.view_stay), 1);
  assert.equal(Number(counts.view_checkout), 1);
  assert.equal(Number(counts.view_tomorrow), 1);
  assert.equal(Number(counts.list_count), 4);

  const page = await db.all(bookingDeskPageQuery(today, "new", "active", 2, 0));
  assert.deepEqual(
    page.map((row) => String((row as { bid: string }).bid)),
    ["b-tmr", "b-new"],
  );
  const checkin = await db.all(bookingDeskPageQuery(today, "checkin", "active", 10, 0));
  assert.deepEqual(
    checkin.map((row) => String((row as { bid: string }).bid)),
    ["b-mix"],
  );
  const staying = await db.all(bookingDeskPageQuery(today, "stay", "inhouse", 10, 0));
  assert.deepEqual(
    staying.map((row) => String((row as { bid: string }).bid)),
    ["b-mix"],
  );
  const leaving = await db.all(bookingDeskPageQuery(today, "checkout", "active", 10, 0));
  assert.deepEqual(
    leaving.map((row) => String((row as { bid: string }).bid)),
    ["b-leave"],
  );

  const cash = await db.all(cashPeriodIdsQuery("2026-10-01", "2026-11-01"));
  assert.deepEqual(
    cash.map((row) => String((row as { bid: string }).bid)).sort(),
    ["b-leave", "b-mix", "b-old", "b-out", "b-tmr"].sort(),
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

test("booking search SQL pages matched heads without hydrating candidates", async () => {
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
      created_at TEXT NOT NULL,
      pms_code TEXT,
      notes TEXT
    )
  `);
  await client.execute({ sql: "INSERT INTO rooms (id, number, type) VALUES (?, ?, ?)", args: ["r1", "101", "Deluxe"] });
  await client.execute({ sql: "INSERT INTO rooms (id, number, type) VALUES (?, ?, ?)", args: ["r2", "102", "Deluxe"] });
  await client.execute({
    sql: `INSERT INTO room_sales
      (id, booking_id, room_id, guest_name, guest_phone, origin, source, status, check_in, check_out, created_at, pms_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ["s1", "bk-1", "r1", "Đặng Minh Tuấn", "0901 222 333", "ops", "booking", "reserved", "2026-09-20", "2026-09-22", "2026-09-01T00:00:00", "BK-09-1", "cần hoa"],
  });
  await client.execute({
    sql: `INSERT INTO room_sales
      (id, booking_id, room_id, guest_name, guest_phone, origin, source, status, check_in, check_out, created_at, pms_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ["s2", "bk-2", "r2", "Đặng Văn B", "0901 222 334", "ops", "booking", "inhouse", today, "2026-10-15", "2026-10-01T00:00:00", "BK-10-2", ""],
  });

  await client.execute({
    sql: `INSERT INTO room_sales
      (id, booking_id, room_id, guest_name, guest_phone, origin, source, status, check_in, check_out, created_at, pms_code, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ["s3", "bk-old", "r1", "Đặng Đã Trả", "0901 222 335", "ops", "booking", "departed", "2026-09-01", "2026-09-02", "2026-09-02T00:00:00", "BK-09-9", ""],
  });

  const counts = (await db.all(bookingSearchCountQuery("dang", today, "new", "active")!))[0] as { list_count: number; active_count: number };
  assert.equal(Number(counts.list_count), 2);
  assert.equal(Number(counts.active_count), 2);

  const departed = (await db.all(bookingSearchCountQuery("dang", today, "new", "reserved", "departed")!))[0] as { list_count: number };
  assert.equal(Number(departed.list_count), 1);
  const departedPage = await db.all(bookingSearchPageQuery("dang", today, "new", "reserved", 10, 0, "departed")!);
  assert.deepEqual(
    departedPage.map((row) => String((row as { bid: string }).bid)),
    ["bk-old"],
  );

  const all = (await db.all(bookingSearchCountQuery("dang", today, "new", "inhouse", "all")!))[0] as { list_count: number };
  assert.equal(Number(all.list_count), 3);

  const page = await db.all(bookingSearchPageQuery("dang", today, "new", "active", 1, 0)!);
  assert.deepEqual(
    page.map((row) => String((row as { bid: string }).bid)),
    ["bk-2"],
  );
});
