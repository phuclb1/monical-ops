import assert from "node:assert/strict";
import { test } from "node:test";
import { KITCHEN_NAV, homePath, sidebarNav } from "../src/lib/nav";

function labels(role: Parameters<typeof sidebarNav>[0], group: string) {
  const block = sidebarNav(role).blocks.find((item) => item.kind === "group" && item.label === group);
  return block?.kind === "group" ? block.items.map((item) => item.label) : [];
}

test("quản lý gom phòng, đưa báo cáo lên quản lý, và gộp cài đặt", () => {
  const nav = sidebarNav("manager");
  assert.deepEqual(labels("manager", "Phòng"), ["Sơ đồ phòng", "Đặt phòng", "Hạng phòng"]);
  assert.deepEqual(labels("manager", "Quản lý"), ["Báo cáo", "Sổ cái", "Chi phí"]);
  assert.deepEqual(nav.footer, [{ href: "/settings", label: "Cài đặt", match: ["/staff"] }]);
  assert.deepEqual(labels("manager", "Điều hành"), ["Dịch vụ kèm", "Bếp / ăn sáng", "Nhật ký", "Thông báo"]);
  const groupAt = nav.blocks.findIndex((block) => block.kind === "group" && block.label === "Quản lý");
  const opsAt = nav.blocks.findIndex((block) => block.kind === "group" && block.label === "Điều hành");
  assert.ok(groupAt >= 0 && groupAt < opsAt);
});

test("lễ tân thấy sơ đồ và đặt phòng, không thấy hạng phòng hay cài đặt", () => {
  assert.deepEqual(labels("reception", "Phòng"), ["Sơ đồ phòng", "Đặt phòng"]);
  assert.deepEqual(labels("reception", "Quản lý"), ["Báo cáo"]);
  assert.deepEqual(sidebarNav("reception").footer, []);
  assert.ok(labels("reception", "Điều hành").includes("Bếp / ăn sáng"));
});

test("bếp có nav riêng, lễ tân về đặt phòng", () => {
  assert.equal(homePath("kitchen"), "/kitchen");
  assert.equal(homePath("reception"), "/sales/bookings");
  assert.deepEqual(
    KITCHEN_NAV.map((item) => item.href),
    ["/kitchen", "/kitchen/forecast", "/account/password"],
  );
});
