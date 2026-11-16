import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingCollectMemo, bookingVietQrUrl } from "../src/lib/vietqr";

test("QR đặt phòng trực tiếp gồm số còn lại và nội dung thu đủ", () => {
  assert.equal(bookingCollectMemo("BK-11-148"), "Thu du tien booking BK-11-148");
  assert.equal(bookingVietQrUrl(0, "BK-11-148"), "");
  const url = new URL(bookingVietQrUrl(200_000, "BK-11-148"));
  assert.equal(url.origin + url.pathname, "https://vietqr.app/img");
  assert.equal(url.searchParams.get("bank"), "Vietcombank");
  assert.equal(url.searchParams.get("acc"), "QRPSEP1ZZZZ55600375");
  assert.equal(url.searchParams.get("template"), "standee");
  assert.equal(url.searchParams.get("holder"), "CONG TY TNHH MACCAL DA LAT");
  assert.equal(url.searchParams.get("store"), "MONICAL HOTEL DALAT");
  assert.equal(url.searchParams.get("amount"), "200000");
  assert.equal(url.searchParams.get("des"), "Thu du tien booking BK-11-148");
});
