import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deskButtonIntent,
  deskIntentFromModel,
  deskQueryDate,
  formatDesk,
  parseDeskAsk,
  type DeskBrief,
} from "../email-agent/src/desk";
import { deskChatIds, normalizeTelegramUsername } from "../email-agent/src/telegram";

test("desk chats are xxxlevn and monical48", () => {
  assert.equal(normalizeTelegramUsername(" @XXXLevN "), "xxxlevn");
  assert.deepEqual(
    deskChatIds([
      { username: "monical48", chatId: "48" },
      { username: "xxxlevn", chatId: "99" },
      { username: "other", chatId: "1" },
    ]),
    ["99", "48"],
  );
  assert.deepEqual(deskChatIds([], ["fallback"]), ["fallback"]);
  assert.deepEqual(deskChatIds([{ username: "xxxlevn", chatId: "99" }], ["fallback"]), ["99"]);
});

const today = "2026-11-11";

test("desk chat understands check-in, still in house, and revenue", () => {
  assert.deepEqual(parseDeskAsk("/list", today), { kind: "arrivals", date: today });
  assert.deepEqual(parseDeskAsk("/list in hôm nay", today), { kind: "arrivals", date: today });
  assert.deepEqual(parseDeskAsk("/list@MonicalBot in hôm nay", today), { kind: "arrivals", date: today });
  assert.deepEqual(parseDeskAsk("in 12/11", today), { kind: "arrivals", date: "2026-11-12" });
  assert.equal(parseDeskAsk("hỏi list khách chưa check out", today).kind, "inhouse");
  assert.equal(parseDeskAsk("khách chưa trả phòng", today).kind, "inhouse");
  assert.deepEqual(parseDeskAsk("trả phòng ngày mai", today), { kind: "departures", date: "2026-11-12" });
  assert.deepEqual(parseDeskAsk("check doanh thu tháng này", today), { kind: "revenue", when: "month" });
  assert.deepEqual(parseDeskAsk("doanh thu hôm nay", today), { kind: "revenue", when: "today" });
  assert.deepEqual(parseDeskAsk("doanh thu hôm qua", today), { kind: "revenue", when: "yesterday" });
  assert.equal(parseDeskAsk("phòng trống", today).kind, "vacant");
  assert.equal(parseDeskAsk("khách còn nợ", today).kind, "due");
  assert.equal(parseDeskAsk("hôm nay thế nào", today).kind, "summary");
  assert.deepEqual(parseDeskAsk("tìm Lan", today), { kind: "find", query: "Lan" });
  assert.deepEqual(parseDeskAsk("phòng 305", today), { kind: "find", query: "305" });
  assert.equal(parseDeskAsk("/help", today).kind, "help");
  assert.equal(parseDeskAsk("/start", today).kind, "none");
  assert.equal(parseDeskAsk("có", today).kind, "none");
  assert.deepEqual(deskButtonIntent("desk:stay", today), { kind: "inhouse" });
  assert.equal(deskButtonIntent("c:draft", today), null);
  assert.equal(deskQueryDate({ kind: "revenue", when: "yesterday" }, today), "2026-11-10");
  assert.deepEqual(deskIntentFromModel('{"kind":"arrivals","when":"tomorrow"}', today), {
    kind: "arrivals",
    date: "2026-11-12",
  });
  assert.equal(deskIntentFromModel("nope", today).kind, "none");
});

test("desk replies stay short and use the Ops figures", () => {
  const brief: DeskBrief = {
    today,
    date: today,
    arrivals: [
      {
        id: "1",
        name: "Minh",
        room: "305",
        phone: "",
        code: "",
        source: "Booking.com",
        status: "reserved",
        mark: "chưa in",
        checkIn: today,
        checkOut: "2026-11-13",
        total: 1_000_000,
        due: 200_000,
        flag: "",
      },
    ],
    departures: [],
    inhouse: [
      {
        id: "2",
        name: "Bình",
        room: "104",
        phone: "",
        code: "",
        source: "",
        status: "inhouse",
        mark: "đã in",
        checkIn: "2026-11-08",
        checkOut: "2026-11-10",
        total: 1_000_000,
        due: 0,
        flag: "late",
      },
    ],
    due: [],
    found: [],
    vacantRooms: ["201"],
    occupancy: { rooms: 10, vacant: 1, reserved: 1, inhouse: 1, ooo: 0 },
    revenue: {
      month: { label: "Tháng 11/2026", count: 2, total: 3_000_000, direct: 2_000_000, ota: 1_000_000, hotelNet: 2_500_000, due: 200_000, recognized: 2_000_000 },
      day: { label: today, count: 1, total: 1_000_000, direct: 0, ota: 1_000_000, hotelNet: 800_000, due: 200_000, recognized: 1_000_000 },
    },
  };
  assert.match(formatDesk({ kind: "arrivals", date: today }, brief), /305 Minh · chưa in/);
  assert.match(formatDesk({ kind: "inhouse" }, brief), /104 Bình · quá hạn/);
  assert.match(formatDesk({ kind: "revenue", when: "month" }, brief), /Tháng 11\/2026/);
  assert.match(formatDesk({ kind: "revenue", when: "month" }, brief), /2\.500\.000₫/);
  assert.match(formatDesk({ kind: "departures", date: today }, brief), /Không có khách trả phòng/);
});
