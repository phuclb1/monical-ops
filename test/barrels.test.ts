import assert from "node:assert/strict";
import { test } from "node:test";
import * as schema from "../src/db/schema";
import * as sales from "../src/lib/sales";
import * as auditView from "../src/lib/audit-view";
import * as taskTypes from "../src/lib/task-types";

test("schema barrel still exports domain tables", () => {
  for (const name of ["users", "rooms", "roomTypes", "roomSales", "stays", "shifts", "tasks", "checklists", "auditLogs"] as const) {
    assert.ok(schema[name], `missing schema.${name}`);
  }
});

test("lib barrels re-export the split public API", () => {
  for (const name of ["bookingQuote", "salePaid", "parseSaleSource", "groupByBooking", "ganttSpan"] as const) {
    assert.equal(typeof sales[name], "function", `sales.${name}`);
  }
  for (const name of ["auditChanges", "auditHref", "actionTone"] as const) {
    assert.equal(typeof auditView[name], "function", `audit-view.${name}`);
  }
  for (const name of ["getTaskType", "taskBoardColumn", "isChecklistTaskKind"] as const) {
    assert.equal(typeof taskTypes[name], "function", `task-types.${name}`);
  }
});
