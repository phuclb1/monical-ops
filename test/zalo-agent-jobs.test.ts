import assert from "node:assert/strict";
import { test } from "node:test";
import { agentSeenFresh, parseGroupList, parseJobEvents, parseJobPayload } from "../src/lib/zalo-agent-jobs";

test("parse job events giữ mảng hợp lệ", () => {
  assert.deepEqual(parseJobEvents("[]"), []);
  assert.deepEqual(parseJobEvents('[{"status":"qr","image":"abc"}]'), [{ status: "qr", image: "abc" }]);
  assert.deepEqual(parseJobEvents("{"), []);
});

test("parse group list bỏ mục hỏng", () => {
  assert.deepEqual(
    parseGroupList(JSON.stringify({ groups: [{ id: "1", name: "Lễ tân", members: 3 }, { id: 2 }, null] })),
    [{ id: "1", name: "Lễ tân", members: 3 }],
  );
});

test("parse payload object", () => {
  assert.deepEqual(parseJobPayload('{"phone":"0901"}'), { phone: "0901" });
  assert.deepEqual(parseJobPayload("[]"), {});
});

test("agent seen trong cửa sổ online", () => {
  assert.equal(agentSeenFresh(new Date().toISOString(), 20_000), true);
  assert.equal(agentSeenFresh(new Date(Date.now() - 60_000).toISOString(), 20_000), false);
  assert.equal(agentSeenFresh(""), false);
});
