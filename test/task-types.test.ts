import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getTaskType,
  isChecklistTaskKind,
  isOpenTaskStatus,
  STAY_TASK_KINDS,
  TASK_TYPES,
  taskBoardColumn,
  taskTypeLabel,
  taskTypesForRole,
} from "../src/lib/task-types";
import { isChecklistKind, shiftOpenTemplate } from "../src/lib/checklists";

test("task catalog helpers survive the split", () => {
  assert.ok(TASK_TYPES.length > 0);
  assert.equal(getTaskType("unknown").kind, "general");
  assert.equal(taskTypeLabel("housekeeping"), getTaskType("housekeeping").label);
  assert.equal(isChecklistTaskKind("shift_open"), true);
  assert.equal(isChecklistTaskKind("towels"), false);
  assert.ok(STAY_TASK_KINDS.includes("housekeeping"));
  assert.equal(taskBoardColumn("in_progress"), "doing");
  assert.equal(taskBoardColumn("new"), "new");
  assert.equal(isOpenTaskStatus("done"), false);
  assert.equal(isOpenTaskStatus("accepted"), true);
  assert.ok(taskTypesForRole("reception").every((item) => item.canCreate.includes("reception")));
});

test("checklist templates stay keyed by shift", () => {
  assert.equal(isChecklistKind("checkin"), true);
  assert.equal(isChecklistKind("towels"), false);
  const morning = shiftOpenTemplate("morning").map((item) => item.key);
  assert.ok(morning.includes("fund"));
  assert.ok(shiftOpenTemplate("night").some((item) => item.key === "noshow"));
});
