import assert from "node:assert/strict";
import { test } from "node:test";
import { sidebarNav } from "../src/lib/nav";

function labels(role: Parameters<typeof sidebarNav>[0], group: string) {
  const block = sidebarNav(role).blocks.find((item) => item.kind === "group" && item.label === group);
  return block?.kind === "group" ? block.items.map((item) => item.label) : [];
}

test("quản lý gom phòng, đưa báo cáo lên quản lý, và gộp cài đặt", () => {
  const nav = sidebarNav("manager");
  assert.deepEqual(labels("manager", "Phòng"), ["Vận hành", "Sơ đồ phòng", "Đặt phòng", "Hạng phòng"]);
  assert.deepEqual(labels("manager", "Quản lý"), ["Báo cáo", "Chi phí"]);
  assert.deepEqual(nav.footer, [{ href: "/settings", label: "Cài đặt", match: ["/staff", "/roster"] }]);
  const ops = nav.blocks.find((block) => block.kind === "group" && block.label === "Điều hành");
  assert.equal(ops?.kind === "group" && ops.items.some((item) => ["/reports", "/settings", "/staff", "/roster", "/sales", "/rooms/manage"].includes(item.href)), false);
  const groupAt = nav.blocks.findIndex((block) => block.kind === "group" && block.label === "Quản lý");
  const opsAt = nav.blocks.findIndex((block) => block.kind === "group" && block.label === "Điều hành");
  assert.ok(groupAt >= 0 && groupAt < opsAt);
});

test("lễ tân thấy sơ đồ và đặt phòng, không thấy hạng phòng hay cài đặt", () => {
  assert.deepEqual(labels("reception", "Phòng"), ["Vận hành", "Sơ đồ phòng", "Đặt phòng"]);
  assert.deepEqual(labels("reception", "Quản lý"), ["Báo cáo"]);
  assert.deepEqual(sidebarNav("reception").footer, []);
});

test("buồng phòng giữ một mục Phòng, không có nhóm bán phòng", () => {
  const nav = sidebarNav("hk");
  assert.equal(nav.blocks.some((block) => block.kind === "group" && block.label === "Phòng"), false);
  assert.equal(
    nav.blocks.some((block) => block.kind === "links" && block.items.some((item) => item.href === "/rooms" && item.label === "Phòng")),
    true,
  );
  assert.deepEqual(sidebarNav("hk").footer, []);
});
