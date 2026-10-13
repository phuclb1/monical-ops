import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import {
  isMachineBookingActor,
  normalizeRoomNumber,
  openBookingChangedSince,
  parseOpenBookingCreate,
  parseOpenSince,
  requestMatchesOpenApiSecret,
  secretMatches,
  serializeOpenBooking,
} from "../src/lib/open-api";
import { generateOpenApiToken, generateWebhookSecret, maskOpenApiToken, webhookUrlError } from "../src/lib/open-api-settings";
import {
  bookingWebhookDiff,
  postBookingWebhook,
  signBookingWebhook,
  type BookingWebhookPayload,
} from "../src/lib/booking-webhook";
import { proxy } from "../src/proxy";

test("open API parse: số phòng, alias ngày, mặc định nguồn", () => {
  const draft = parseOpenBookingCreate({
    guestName: "  Nguyễn Văn A  ",
    arrivalDate: "2026-10-15",
    departureDate: "2026-10-17",
    roomNumber: "P.401",
    rate: "900.000",
    guestPhone: "0901",
  });
  assert.equal(draft.guestName, "Nguyễn Văn A");
  assert.equal(draft.checkIn, "2026-10-15");
  assert.equal(draft.checkOut, "2026-10-17");
  assert.equal(draft.source, "walk_in");
  assert.equal(draft.origin, "ops");
  assert.equal(draft.rooms.length, 1);
  assert.equal(draft.rooms[0]?.roomNumber, "401");
  assert.equal(draft.rooms[0]?.rate, 900000);

  const ez = parseOpenBookingCreate({
    guestName: "B",
    origin: "ezcloud",
    checkIn: "2026-10-15",
    checkOut: "2026-10-16",
    rooms: [{ roomNumber: "402", adults: 2, breakfast: false }],
    pmsCode: "EZ-1",
  });
  assert.equal(ez.source, "ezcloud");
  assert.equal(ez.rooms[0]?.breakfast, false);
});

test("open API parse từ chối thiếu tên / phòng / ngày", () => {
  assert.throws(() => parseOpenBookingCreate({ checkIn: "2026-10-15", checkOut: "2026-10-16", roomNumber: "401" }), /tên khách/i);
  assert.throws(() => parseOpenBookingCreate({ guestName: "A", checkIn: "2026-10-15", checkOut: "2026-10-16" }), /Chọn phòng/);
  assert.throws(() => parseOpenBookingCreate({ guestName: "A", checkIn: "2026-10-16", checkOut: "2026-10-15", roomNumber: "401" }), /sau ngày nhận/);
});

test("chuẩn hóa số phòng và so secret", () => {
  assert.equal(normalizeRoomNumber("P.401"), "401");
  assert.equal(normalizeRoomNumber("p401"), "401");
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abc", "abd"), false);
  assert.equal(secretMatches("abc", "ab"), false);
  assert.equal(isMachineBookingActor("open-api-agent"), true);
  assert.equal(isMachineBookingActor("ingest-agent"), true);
  assert.equal(isMachineBookingActor("u-quanly"), false);
});

test("serialize booking cho agent", () => {
  const json = serializeOpenBooking({
    id: "bk-1",
    guestName: "A",
    guestPhone: "0901",
    origin: "ops",
    source: "walk_in",
    otaPaymentMode: "debt",
    otaCommissionKind: "percent",
    otaCommissionValue: 0,
    otaCommissionPercent: 0,
    invoiceRequested: false,
    pmsCode: "BK-10-1",
    notes: "ghi chú",
    adults: 2,
    children: 0,
    breakfastAdults: 2,
    breakfastChildren: 0,
    cars: 0,
    bikes: 0,
    deposit: 100000,
    checkinPaid: 0,
    checkinMethod: "",
    cashPaid: 100000,
    transferPaid: 0,
    companyPaid: 0,
    refundCash: 0,
    refundTransfer: 0,
    refundCompany: 0,
    refundedAt: null,
    due: 800000,
    createdAt: "2026-10-12T00:00:00.000Z",
    checkIn: "2026-10-15",
    checkOut: "2026-10-16",
    rooms: [
      {
        id: "s-1",
        bookingId: "bk-1",
        roomId: "r-401",
        guestName: "A",
        guestPhone: "0901",
        origin: "ops",
        source: "walk_in",
        status: "reserved",
        checkIn: "2026-10-15",
        checkOut: "2026-10-16",
        rate: 900000,
        adults: 2,
        children: 0,
        breakfast: true,
        updatedAt: "2026-10-12T00:05:00.000Z",
        room: { id: "r-401", number: "401", type: "DELUXE", floor: 4, opsStatus: "vacant_clean" },
      } as never,
    ],
    roomCount: 1,
    roomLabel: "P.401",
    typeLabel: "DELUXE",
    status: "reserved",
    nights: 1,
    subtotal: 900000,
    discount: 0,
    breakfastOff: 0,
    roomTotal: 900000,
    extras: [],
    extrasTotal: 0,
    total: 900000,
  } as never);
  assert.equal(json.id, "bk-1");
  assert.equal(json.pmsCode, "BK-10-1");
  assert.equal(json.rooms[0]?.roomNumber, "401");
  assert.equal(json.rooms[0]?.saleId, "s-1");
  assert.equal(json.updatedAt, "2026-10-12T00:05:00.000Z");
});

test("poll since chỉ lấy booking mới hoặc vừa sửa", () => {
  assert.equal(parseOpenSince("2026-10-12T07:50:00.000Z"), "2026-10-12T07:50:00.000Z");
  assert.equal(parseOpenSince("2026-10-12"), "2026-10-12T00:00:00.000Z");
  const booking = {
    createdAt: "2026-10-12T07:40:00.000Z",
    rooms: [{ updatedAt: "2026-10-12T07:51:00.000Z" }],
  };
  assert.equal(openBookingChangedSince(booking, "2026-10-12T07:50:00.000Z"), true);
  assert.equal(openBookingChangedSince(booking, "2026-10-12T07:51:00.000Z"), false);
  assert.equal(openBookingChangedSince({ createdAt: "2026-10-12T07:40:00.000Z", rooms: [] }, "2026-10-12T07:50:00.000Z"), false);
});

test("webhook diff: tạo, đổi phòng, thêm ngày, thêm phòng", () => {
  const created = bookingWebhookDiff(null, [
    { saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" },
  ]);
  assert.deepEqual(created.events, ["booking.created"]);

  const moved = bookingWebhookDiff(
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
    [{ saleId: "s-1", roomId: "r-402", roomNumber: "402", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
  );
  assert.deepEqual(moved.events, ["booking.room_changed"]);
  assert.equal(moved.changes.rooms[0]?.from, "401");
  assert.equal(moved.changes.rooms[0]?.to, "402");

  const extended = bookingWebhookDiff(
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-18" }],
  );
  assert.deepEqual(extended.events, ["booking.dates_changed"]);
  assert.equal(extended.changes.dates[0]?.to.checkOut, "2026-10-18");

  const added = bookingWebhookDiff(
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
    [
      { saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" },
      { saleId: "s-2", roomId: "r-402", roomNumber: "402", checkIn: "2026-10-15", checkOut: "2026-10-16" },
    ],
  );
  assert.deepEqual(added.events, ["booking.rooms_added"]);

  const noop = bookingWebhookDiff(
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
    [{ saleId: "s-1", roomId: "r-401", roomNumber: "401", checkIn: "2026-10-15", checkOut: "2026-10-16" }],
  );
  assert.deepEqual(noop.events, []);
});

test("ký HMAC webhook và gửi header event", async () => {
  const body = JSON.stringify({ event: "booking.created" });
  const signature = await signBookingWebhook("top-secret", "1720000000", body);
  assert.match(signature, /^sha256=[0-9a-f]{64}$/);
  const again = await signBookingWebhook("top-secret", "1720000000", body);
  assert.equal(signature, again);
  const other = await signBookingWebhook("other", "1720000000", body);
  assert.notEqual(signature, other);

  const calls: { url: string; init: RequestInit }[] = [];
  const payload: BookingWebhookPayload = {
    event: "booking.dates_changed",
    events: ["booking.dates_changed"],
    at: "2026-10-12T00:00:00.000Z",
    actor: { id: "u-1", name: "Quản lý" },
    bookingId: "bk-1",
    pmsCode: "BK-10-1",
    changes: { rooms: [], dates: [], addedRooms: [], removedRooms: [] },
    booking: {
      id: "bk-1",
      pmsCode: "BK-10-1",
      guestName: "A",
      guestPhone: null,
      origin: "ops",
      source: "walk_in",
      status: "reserved",
      checkIn: "2026-10-15",
      checkOut: "2026-10-18",
      nights: 3,
      adults: 2,
      children: 0,
      notes: null,
      total: 0,
      deposit: 0,
      rooms: [],
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-12T00:00:00.000Z",
    },
  };
  await postBookingWebhook({ url: "https://codex.example/hook", secret: "top-secret" }, payload, async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return new Response("ok", { status: 200 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://codex.example/hook");
  const headers = new Headers(calls[0]?.init.headers);
  assert.equal(headers.get("x-ops-event"), "booking.dates_changed");
  assert.equal(headers.get("content-type"), "application/json");
  assert.match(headers.get("x-ops-signature") || "", /^sha256=/);
});

test("open API không đòi đăng nhập", async () => {
  const list = await proxy(new NextRequest("https://platform.monicalhoteldalat.com/api/open/bookings", { method: "GET" }));
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("location"), null);

  const one = await proxy(new NextRequest("https://platform.monicalhoteldalat.com/api/open/bookings/BK-10-1", { method: "GET" }));
  assert.equal(one.status, 200);
  assert.equal(one.headers.get("location"), null);
});

test("open API authorized đọc Bearer", () => {
  const request = (token: string) =>
    new Request("https://ops.local/api/open/bookings", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(requestMatchesOpenApiSecret(request("hotel-open-key"), "hotel-open-key"), true);
  assert.equal(requestMatchesOpenApiSecret(request("wrong-key-xx"), "hotel-open-key"), false);
});

test("sinh token Open API và kiểm URL webhook", () => {
  const token = generateOpenApiToken();
  assert.match(token, /^ops_[0-9a-f]{64}$/);
  assert.notEqual(token, generateOpenApiToken());
  assert.equal(maskOpenApiToken(token), `ops_••••••••${token.slice(-4)}`);
  assert.match(generateWebhookSecret(), /^whsec_[0-9a-f]{64}$/);
  assert.equal(webhookUrlError(""), null);
  assert.equal(webhookUrlError("https://codex.example/hook"), null);
  assert.equal(webhookUrlError("not-a-url"), "URL webhook không hợp lệ.");
});
