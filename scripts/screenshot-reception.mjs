import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp", "ops-flow");
const base = process.env.OPS_URL || "http://localhost:3002";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

let step = 0;
async function shot(name) {
  step += 1;
  const file = join(outDir, `${String(step).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`SHOT ${file.replace(`${root}/`, "")}  ${page.url()}`);
}

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(450);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready();
}

async function login(username) {
  await go("/login");
  await page.getByPlaceholder("ngan").fill(username);
  await page.locator('input[name="password"]').fill("123456");
  await Promise.all([
    page.waitForURL(/\/today/, { timeout: 20000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();
}

try {
  await go("/login");
  await page.getByPlaceholder("ngan").fill("ngan");
  await page.locator('input[name="password"]').fill("123456");
  await shot("login-le-tan");
  await Promise.all([
    page.waitForURL(/\/today/, { timeout: 20000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();

  if (await page.getByRole("button", { name: "Mở ca hiện tại" }).count()) {
    await shot("today-chua-mo-ca");
    await page.getByRole("button", { name: "Mở ca hiện tại" }).click();
    await ready();
  }
  await shot("today-ngan");

  await page.getByRole("link", { name: /Đến/ }).first().click();
  await ready();
  await shot("le-tan-dang-o");

  await page.getByRole("link", { name: "Khách đến" }).click();
  await ready();
  await shot("le-tan-khach-den");

  await page.getByRole("link", { name: "Khách đi" }).click();
  await ready();
  await shot("le-tan-khach-di");

  await page.getByRole("link", { name: "Chưa đến" }).click();
  await ready();
  await shot("le-tan-chua-den");

  await page.getByRole("link", { name: "Đang ở" }).click();
  await ready();
  await page.locator('a[href^="/reception/"]').first().click();
  await ready();
  await shot("the-khach-305");

  await page.locator('select[name="kind"]').selectOption("towels");
  await page.locator('input[name="content"]').fill("2 khăn tắm — test 14/09");
  await page.getByRole("button", { name: "Thêm việc" }).click();
  await ready();
  await shot("the-khach-them-khan");

  await go("/reception/s-102");
  await shot("the-khach-di-102");

  await go("/tasks");
  await shot("bang-viec-le-tan");

  await go("/tasks?group=room");
  await shot("bang-viec-theo-phong");

  await go("/tasks?group=general");
  await shot("bang-viec-chung");

  await go("/tasks/new");
  await shot("tao-viec-loai");

  await page.locator('select[name="kind"]').selectOption("housekeeping");
  await ready();
  await shot("tao-viec-don-phong");

  await go("/handover");
  await shot("ban-giao");
  const handover = await page.locator("body").innerText();
  const must = ["Việc đang dở", "Thay khăn", "Khách gửi xe"];
  const missing = must.filter((text) => !handover.includes(text));
  console.log(missing.length ? `MISSING_ON_HANDOVER ${missing.join(" | ")}` : "HANDOVER_OK");

  await go("/more");
  await page.getByRole("button", { name: /Đăng xuất/ }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => go("/login"));
  await ready();

  await login("uyen");
  await shot("today-hk");
  await go("/tasks");
  await shot("bang-viec-hk");
  await go("/tasks/new");
  await shot("tao-viec-hk");

  await go("/more");
  await page.getByRole("button", { name: /Đăng xuất/ }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => go("/login"));
  await ready();

  await login("quanly");
  await go("/tasks");
  await shot("bang-viec-quan-ly");
  await go("/tasks/new");
  await shot("tao-viec-quan-ly");

  console.log("DONE", step);
} finally {
  await browser.close();
}
