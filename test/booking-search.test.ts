import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesBookingSearch, type BookingSearchRow } from "../src/lib/sales";
import { foldSearchText, matchesSearchText, searchTokens } from "../src/lib/search-text";

const row = (patch: Partial<BookingSearchRow> = {}): BookingSearchRow => ({
  id: "bk-1",
  guestName: "Đặng Minh Tuấn",
  guestPhone: "0901 222 333",
  pmsCode: "BK-09-1",
  notes: "VIP công ty — cần hoa",
  roomLabel: "P.101 · P.202",
  typeLabel: "Deluxe · Standard",
  source: "booking",
  origin: "ops",
  status: "reserved",
  checkIn: "2026-09-20",
  checkOut: "2026-09-22",
  extras: [{ name: "Thêm đệm" }],
  rooms: [{ room: { number: "101", type: "Deluxe" } }, { room: { number: "202", type: "Standard" } }],
  ...patch,
});

test("foldSearchText strips Vietnamese marks and đ", () => {
  assert.equal(foldSearchText("Đặng Minh Tuấn"), "dang minh tuan");
  assert.deepEqual(searchTokens("  Minh   101 "), ["minh", "101"]);
});

test("matchesSearchText requires every token, including compact codes", () => {
  assert.equal(matchesSearchText("P.101 Deluxe Đặng", "dang 101"), true);
  assert.equal(matchesSearchText("BK-09-1", "bk091"), true);
  assert.equal(matchesSearchText("P.101 Deluxe", "101 305"), false);
  assert.equal(matchesSearchText("Điện thoại Lê Hoàng", "hoa"), false);
  assert.equal(matchesSearchText("VIP cần hoa", "hoa"), true);
});

test("booking full-text search covers guest, phone, room, code, notes, extras, source", () => {
  const booking = row();
  assert.equal(matchesBookingSearch(booking, ""), true);
  assert.equal(matchesBookingSearch(booking, "dang tuan"), true);
  assert.equal(matchesBookingSearch(booking, "0901222333"), true);
  assert.equal(matchesBookingSearch(booking, "090 222"), true);
  assert.equal(matchesBookingSearch(booking, "p.101"), true);
  assert.equal(matchesBookingSearch(booking, "minh 202"), true);
  assert.equal(matchesBookingSearch(booking, "bk-09-1"), true);
  assert.equal(matchesBookingSearch(booking, "bk091"), true);
  assert.equal(matchesBookingSearch(booking, "can hoa"), true);
  assert.equal(matchesBookingSearch(booking, "them dem"), true);
  assert.equal(matchesBookingSearch(booking, "booking.com"), true);
  assert.equal(matchesBookingSearch(booking, "20/09/2026"), true);
  assert.equal(matchesBookingSearch(booking, "hang 101"), false);
  assert.equal(matchesBookingSearch(row({ source: "phone", notes: null, guestName: "Mai Thanh Hà" }), "hoa"), false);
  assert.equal(matchesBookingSearch(row({ guestName: "Lê Hoàng Nam", notes: null }), "hoa"), false);
});
