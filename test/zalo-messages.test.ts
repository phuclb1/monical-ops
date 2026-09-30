import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeZaloGroups, normalizeZaloMessages, scheduleIsDue } from "../src/lib/zalo-messages";

const at = (hhmm: string) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 29, hour - 7, minute));
};

test("tin hằng ngày đến giờ trong cửa sổ 20 phút và chưa gửi hôm nay", () => {
  const message = { enabled: true, kind: "schedule" as const, time: "07:00", lastSentOn: "" };
  assert.equal(scheduleIsDue(message, at("06:59")), false);
  assert.equal(scheduleIsDue(message, at("07:00")), true);
  assert.equal(scheduleIsDue(message, at("07:19")), true);
  assert.equal(scheduleIsDue(message, at("07:20")), false);
  assert.equal(scheduleIsDue({ ...message, lastSentOn: "2026-09-29" }, at("07:05")), false);
  assert.equal(scheduleIsDue({ ...message, enabled: false }, at("07:05")), false);
  assert.equal(scheduleIsDue({ ...message, kind: "trigger" }, at("07:05")), false);
});

test("nhóm và tin đọc từ cấu hình cũ khi chưa có bản mới", () => {
  const legacy = [
    { key: "reception", groupId: "111", groupName: "Lễ tân", template: "Hôm nay có {{checkin}} phòng check-in\n{{dsCheckin}}" },
    { key: "booking", groupId: "222", groupName: "Booking", template: "Đã tạo booking {{ma}}" },
  ];
  const groups = normalizeZaloGroups(undefined, legacy);
  assert.deepEqual(
    groups.map((group) => [group.slot, group.groupId, group.groupName]),
    [
      ["reception", "111", "Lễ tân"],
      ["booking", "222", "Booking"],
    ],
  );
  const messages = normalizeZaloMessages(undefined, legacy);
  const daily = messages.find((item) => item.id === "daily-reception");
  const created = messages.find((item) => item.id === "booking-created");
  assert.equal(daily?.template.includes("{{dsCheckin}}"), true);
  assert.equal(daily?.time, "07:00");
  assert.equal(daily?.kind, "schedule");
  assert.equal(created?.template, "Đã tạo booking {{ma}}\nNgười tạo: {{tao}}");
  assert.equal(created?.event, "booking_created");
  assert.equal(created?.group, "booking");
  const updated = messages.find((item) => item.id === "booking-updated");
  assert.equal(updated?.template, "Sửa booking {{ma}}\n{{suaGi}}\nNgười sửa: {{sua}}\nNgười duyệt: {{duyet}}");
});
