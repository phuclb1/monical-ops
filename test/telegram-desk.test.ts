import assert from "node:assert/strict";
import { test } from "node:test";
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
