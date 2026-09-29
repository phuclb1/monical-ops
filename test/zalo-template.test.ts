import assert from "node:assert/strict";
import { test } from "node:test";
import { breakfastDay } from "../src/lib/breakfast-report";
import {
  bookingEditSummary,
  bookingZaloVars,
  breakfastZaloVars,
  normalizeZaloChannels,
  receptionDigest,
  receptionZaloVars,
  renderZaloTemplate,
  zaloOutbound,
  ZALO_BOT_NAME,
} from "../src/lib/zalo-templates";

test("tin không gắn Trợ Lý Monical ở đầu", () => {
  assert.equal(zaloOutbound("Đã tạo booking BK1"), "Đã tạo booking BK1");
  assert.equal(zaloOutbound(`${ZALO_BOT_NAME}\nĐã tạo booking BK1`), "Đã tạo booking BK1");
});

test("mẫu booking và lễ tân điền đúng chỗ", () => {
  const booking = renderZaloTemplate(
    "Đã tạo booking {{ma}}\nKhách: {{khach}}\nHạng: {{hang}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}",
    bookingZaloVars({
      code: "BK1",
      guest: "Lan",
      rooms: "P.101",
      hang: "Deluxe",
      invoice: true,
      createdBy: "Minh Quản lý",
      editedBy: "Ngân Lễ tân",
      edited: "",
      checkIn: "2026-09-29",
      checkOut: "2026-09-30",
      due: 500000,
    }),
  );
  assert.match(booking, /BK1/);
  assert.match(booking, /Lan/);
  assert.match(booking, /Deluxe/);
  assert.match(booking, /Xuất hóa đơn: Có/);
  assert.match(booking, /Người tạo: Minh Quản lý/);
  assert.match(booking, /500\.000₫/);

  const stats = receptionDigest(
    [
      {
        id: "b2",
        guestName: "Minh",
        pmsCode: "BK2",
        due: 800000,
        source: "walk_in",
        rooms: [
          { status: "reserved", checkIn: "2026-09-29", checkOut: "2026-09-30", room: { number: "202", type: "deluxe" } },
          { status: "reserved", checkIn: "2026-09-29", checkOut: "2026-09-30", room: { number: "201", type: "superior" } },
        ],
      },
      {
        id: "b1",
        guestName: "Lan",
        pmsCode: "BK1",
        due: 500000,
        source: "phone",
        rooms: [{ status: "reserved", checkIn: "2026-09-29", checkOut: "2026-09-30", room: { number: "101", type: "deluxe" } }],
      },
      {
        id: "ota",
        guestName: "OTA",
        pmsCode: "AG1",
        due: 200000,
        source: "booking",
        otaPaymentMode: "debt",
        rooms: [{ status: "inhouse", checkIn: "2026-09-28", checkOut: "2026-09-29", room: { number: "303" } }],
      },
    ],
    "2026-09-29",
  );
  assert.equal(stats.checkin, 3);
  assert.equal(stats.checkout, 1);
  assert.equal(stats.due, 1300000);
  const text = renderZaloTemplate("Hôm nay có {{checkin}} phòng check-in\n{{dsCheckin}}", receptionZaloVars(stats, "2026-09-29"));
  assert.match(text, /Hôm nay có 3 phòng check-in/);
  assert.match(text, /P\.101 Deluxe - Lan - BK1 - phải thu 500\.000₫/);
  assert.match(text, /P\.201 Superior, P\.202 Deluxe - Minh - BK2 - phải thu 800\.000₫/);
  assert.ok(text.indexOf("P.101") < text.indexOf("P.201"));
});

test("nhóm việc cũ được giữ khi chưa có cấu hình kênh", () => {
  const channels = normalizeZaloChannels(null, { groupId: "123", groupName: "Việc nhà" });
  assert.equal(channels.find((item) => item.key === "task")?.groupId, "123");
  assert.equal(channels.find((item) => item.key === "booking")?.groupId, "");
  const saved = normalizeZaloChannels([{ key: "booking", groupId: "9", groupName: "Book", template: "Xin chào {{khach}}" }]);
  assert.equal(saved.find((item) => item.key === "booking")?.template, "Xin chào {{khach}}");
  assert.match(saved.find((item) => item.key === "reception")?.template || "", /phòng check-in/);
});

test("tin sửa booking kể thay đổi giống nhật ký", () => {
  const text = bookingEditSummary(
    [
      { key: "checkIn", label: "Ngày nhận phòng", before: "29/09/2026", after: "30/09/2026", kind: "change" },
      { key: "roomId", label: "Phòng", before: "r1", after: "r2", kind: "change" },
    ],
    { r1: "101", r2: "202" },
  );
  assert.equal(text, "Ngày nhận phòng: 29/09/2026 → 30/09/2026\nPhòng: P.101 → P.202");
});

test("báo cáo ăn sáng liệt kê suất của đêm trước, kèm hạng phòng", () => {
  const day = breakfastDay(
    [
      {
        id: "s1",
        guestName: "Lan",
        status: "inhouse",
        checkIn: "2026-09-28",
        checkOut: "2026-09-30",
        adults: 2,
        children: 1,
        breakfast: true,
        breakfastAdults: 2,
        breakfastChildren: 1,
        room: { number: "101", type: "deluxe" },
      },
      {
        id: "s2",
        guestName: "Mai",
        status: "reserved",
        checkIn: "2026-09-29",
        checkOut: "2026-09-30",
        adults: 2,
        children: 0,
        breakfast: true,
        room: { number: "202", type: "superior" },
      },
    ],
    "2026-09-29",
    [{ name: "deluxe" }],
  );
  const text = renderZaloTemplate(
    "Ăn sáng hôm nay: {{suat}} suất ({{nl}} NL + {{te}} TE) · {{phong}} phòng\n{{dsAnSang}}",
    breakfastZaloVars(day),
  );
  assert.match(text, /3 suất \(2 NL \+ 1 TE\) · 1 phòng/);
  assert.match(text, /P\.101 Deluxe - Lan - 2 NL \+ 1 TE - đã nhận/);
  assert.equal(text.includes("Mai"), false);
});
