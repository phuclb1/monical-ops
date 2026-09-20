import assert from "node:assert/strict";
import { test } from "node:test";
import { stayForSale } from "../src/lib/checklist-ops";
import {
  canCheckinAfterStandby,
  canCheckoutAfterInspect,
  handoffBlockReason,
  handoffSpec,
  receptionKindAfterInspect,
} from "../src/lib/room-handoff";
import { saleStatusToStay } from "../src/lib/sales";
import { stayBoardStatus } from "../src/lib/stay-checklist";

const date = "2026-09-19";

test("HK inspect unlocks reception checkin/checkout; stayover is a separate request", () => {
  assert.equal(handoffSpec("standby", "105", "Hà").formCode, "hk-standby");
  assert.equal(handoffSpec("stayover", "202", "Hạnh").kind, "housekeeping");
  assert.equal(handoffSpec("checkout_inspect", "102", "Anh").formCode, "hk-co-inspect");
  assert.equal(receptionKindAfterInspect("hk-standby"), "checkin");
  assert.equal(receptionKindAfterInspect("hk-co-inspect"), "checkout");

  const waiting = [{ kind: "inspect", formCode: "hk-standby", status: "new", content: "Standby" }];
  assert.equal(canCheckinAfterStandby(waiting), false);
  assert.equal(handoffBlockReason("checkin", waiting), "HK đang kiểm phòng standby");

  const ready = [{ kind: "inspect", formCode: "hk-standby", status: "done", content: "Standby" }];
  assert.equal(canCheckinAfterStandby(ready), true);
  assert.equal(handoffBlockReason("checkin", ready), null);

  const checkoutWait = [{ kind: "inspect", formCode: "hk-co-inspect", status: "in_progress", content: "Kiểm trả" }];
  assert.equal(canCheckoutAfterInspect(checkoutWait), false);
  const checkoutOk = [{ kind: "inspect", formCode: "hk-co-inspect", status: "done", content: "Kiểm trả" }];
  assert.equal(canCheckoutAfterInspect(checkoutOk), true);
});

test("stayForSale prefers same room + pms; stay board treats checkout day as departing", () => {
  const stays = [
    { id: "s-a", roomId: "r-105", guestName: "Thu Hà", status: "arriving", arrivalDate: date, departureDate: "2026-09-22", pmsCode: "BK" },
    { id: "s-b", roomId: "r-202", guestName: "Hạnh", status: "inhouse", arrivalDate: "2026-09-18", departureDate: "2026-09-21", pmsCode: "BK" },
  ];
  const sale = { roomId: "r-202", guestName: "Hạnh", status: "inhouse", checkIn: "2026-09-18", checkOut: "2026-09-21", pmsCode: "BK" };
  assert.equal(stayForSale(stays, sale)?.id, "s-b");
  assert.equal(stayBoardStatus({ status: "inhouse", arrivalDate: "2026-09-17", departureDate: date }, date), "departing");
  assert.equal(saleStatusToStay("cancelled"), "departed");
  assert.equal(saleStatusToStay("inhouse", { checkOut: date, date }), "departing");
});
