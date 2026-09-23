import assert from "node:assert/strict";
import { test } from "node:test";
import { stayOpsChecklist } from "../src/lib/stay-checklist";

function departing(invoiceRequested: boolean) {
  return {
    status: "departing",
    pmsBookingOk: true,
    pmsCheckinOk: true,
    pmsCheckoutOk: false,
    invoiceRequested,
    invoiceOk: false,
    registrationDoneAt: null,
    room: { hkStatus: "waiting", opsStatus: "vacant_dirty" },
    vehicles: [],
    requests: [],
    tasks: [],
  };
}

test("checkout only requires an invoice when the booking requested one", () => {
  assert.equal(stayOpsChecklist(departing(false)).some((row) => row.key === "invoice"), false);
  assert.equal(stayOpsChecklist(departing(true)).some((row) => row.key === "invoice" && row.required), true);
});
