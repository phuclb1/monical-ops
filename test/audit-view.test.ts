import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionTone,
  auditActorName,
  auditChanges,
  auditHref,
  auditTarget,
  formatAuditValue,
  INGEST_ACTOR_ID,
} from "../src/lib/audit-view";

test("auditChanges diffs objects and skips unchanged / skipped fields", () => {
  const rows = auditChanges(
    { guestName: "A", deposit: 100_000, updatedAt: "old", status: "reserved" },
    { guestName: "B", deposit: 200_000, updatedAt: "new", status: "inhouse" },
  );
  const keys = rows.map((row) => row.key).sort();
  assert.deepEqual(keys, ["deposit", "guestName", "status"]);
  assert.equal(rows.find((row) => row.key === "status")?.after, "Đang ở");
  assert.equal(rows.find((row) => row.key === "deposit")?.kind, "change");
  assert.equal(formatAuditValue(true), "Có");
  assert.equal(formatAuditValue("data:image/png;base64,abc"), "(ảnh)");
});

test("patch-only after object only reports provided keys", () => {
  const rows = auditChanges({ guestName: "A", rate: 1, notes: "x" }, { rate: 2 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "rate");
});

test("audit target, href, actor, tone", () => {
  assert.equal(auditTarget("room", { number: "105" }, null), "P.105");
  assert.equal(auditTarget("user", null, { fullName: "Lan" }), "Lan");
  assert.equal(auditHref("task", "t1", null, null), "/tasks/t1");
  assert.equal(auditHref("room_sale", "s1", null, { bookingId: "bk1" }), "/sales/bookings/bk1");
  assert.equal(auditHref("breakfast", "x", null, null), "/kitchen");
  assert.equal(auditActorName(INGEST_ACTOR_ID, "ignored"), "Agent PMS");
  assert.equal(auditActorName("u1", "  Nga  "), "Nga");
  assert.equal(actionTone("create"), "ok");
  assert.equal(actionTone("cancel"), "danger");
  assert.equal(actionTone("ingest"), "gold");
});
