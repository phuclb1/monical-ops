import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.OPS_URL || "http://localhost:3002").replace(/\/$/, "");
const managerUser = process.env.OPS_MANAGER_USER || "quanly";
const password = process.env.OPS_PASSWORD || "123456";
const runId = process.env.QA_RUN_ID || `TX-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const guest = process.env.OPS_GUEST || `E2E So cai ${runId.slice(-10)}`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const results = [];
let bookingUrl = "";
let room = "";

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function waitText(needle, timeout = 20000) {
  await page.getByText(needle, { exact: false }).first().waitFor({ timeout });
}

async function confirmSave() {
  const confirm = page.getByRole("heading", { name: "Xác nhận lưu booking" });
  if (await confirm.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) {
    await page.getByRole("button", { name: "Lưu đặt phòng", exact: true }).last().click();
  }
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready();
}

async function login() {
  await context.clearCookies();
  await go("/login");
  await page.locator('input[name="username"]').fill(managerUser);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();
}

async function pageText() {
  const body = await page.locator("body").innerText();
  return body.replace(/[\u00a0\u202f]/g, " ");
}

async function assertText(needles, excluded = []) {
  const text = await pageText();
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
  const found = excluded.filter((needle) => text.includes(needle));
  if (found.length) throw new Error(`Không được có: ${found.join(" | ")} · URL ${page.url()}`);
}

async function pickOpenRoom() {
  const board = page.locator(".night-board");
  await board.waitFor({ timeout: 15000 });
  const stay = board.getByRole("button", { name: "Cả kỳ", exact: true }).first();
  if (!(await stay.count())) throw new Error("Không còn phòng trống cả kỳ");
  const label = await stay.locator("xpath=ancestor::tr[1]").locator("th span").first().innerText();
  const number = (label.match(/P\.(\S+)/) || [])[1] || "";
  await stay.click();
  if (!number) throw new Error("Không đọc được số phòng");
  return number;
}

async function check(id, title, fn) {
  const row = { id, title, result: "fail", evidence: `qa/evidence/${runId}/${id}.png`, note: "" };
  const shot = join(outDir, `${id}.png`);
  try {
    await fn();
    await page.screenshot({ path: shot, fullPage: true });
    row.result = "pass";
  } catch (error) {
    row.note = String(error?.message || error).slice(0, 400);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`FAIL ${id}`, row.note);
  }
  results.push(row);
  console.log(`${row.result.toUpperCase()} ${id}  ${title}`);
}

async function cleanup() {
  if (!bookingUrl) return;
  await go(bookingUrl);
  const trigger = page.getByRole("button", { name: "Hủy booking", exact: true });
  if (!(await trigger.count())) return;
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  const refund = dialog.getByRole("checkbox", { name: /Đã hoàn cọc/ });
  if (await refund.count()) await refund.check();
  await dialog.getByRole("button", { name: "Hủy booking", exact: true }).click();
  await page.getByText("Hủy", { exact: true }).first().waitFor({ timeout: 30000 });
}

try {
  await check("TX-14", "Booking cũ hiện mục Giao dịch sau backfill", async () => {
    await login();
    await go("/sales/bookings");
    const row = page.locator('a[href^="/sales/bookings/"]').filter({ hasNotText: "In xác nhận" }).first();
    await row.click();
    await page.waitForURL(/\/sales\/bookings\/[^/?]+$/, { timeout: 20000 });
    await waitText("Giao dịch");
    const text = await pageText();
    if (!text.includes("Đặt cọc") && !text.includes("Chưa có giao dịch") && !text.includes("Công nợ OTA")) {
      throw new Error("Không thấy sổ cái hoặc công nợ OTA");
    }
  });

  await check("TX-15a", "Tạo walk-in có cọc → 1 dòng Đặt cọc", async () => {
    await go("/sales/new");
    room = await pickOpenRoom();
    await page.locator('input[name="guestName"]').fill(guest);
    await page.locator('input[name="guestPhone"]').fill("0900000415");
    await page.locator('input[name="deposit"]').fill("500000");
    const checkinNow = page.locator('input[name="checkinNow"]');
    if (await checkinNow.count()) await checkinNow.uncheck();
    await page.getByRole("button", { name: /Lưu/ }).first().click();
    await confirmSave();
    await page.waitForURL(/\/sales\/bookings\//, { timeout: 45000 });
    await waitText("Giao dịch");
    bookingUrl = new URL(page.url()).pathname;
    await assertText([guest, `P.${room}`, "Đã đặt cọc 500.000₫", "Giao dịch", "Đặt cọc"]);
  });

  await check("TX-15b", "Thu thêm 200.000₫ → thêm dòng Thu thêm", async () => {
    await go(bookingUrl);
    await waitText("Giao dịch");
    await page.locator('input[name="amount"]').fill("200000");
    await page.getByRole("button", { name: /Thu 200/ }).click();
    await waitText("Thu thêm");
    await assertText(["Thu thêm", "200.000₫", "Đặt cọc 500.000₫"]);
  });

  await check("TX-06", "Form sửa không còn ô đặt cọc / thu đủ", async () => {
    await go(bookingUrl);
    await waitText("Giao dịch");
    const fold = page.locator("summary").filter({ hasText: "Sửa booking" });
    if (await fold.count()) await fold.click();
    await page.locator('textarea[name="notes"]').waitFor({ timeout: 15000 });
    const deposit = page.locator('input[name="deposit"]');
    if (await deposit.count()) {
      const visible = await deposit.evaluate((el) => el.type !== "hidden" && el.offsetParent !== null);
      if (visible) throw new Error("Form sửa vẫn còn ô đặt cọc");
    }
    await assertText(["danh sách giao dịch"]);
  });
} finally {
  await check("TX-15c", "Hủy booking kiểm thử", async () => {
    await cleanup();
  });
  await browser.close();
  const passed = results.filter((row) => row.result === "pass").length;
  const failed = results.filter((row) => row.result === "fail").length;
  const manifest = {
    runId,
    commit: gitCommit(),
    env: base,
    passed,
    failed,
    results,
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`${passed}/${results.length} pass · ${failed} fail · ${outDir}`);
  if (failed) process.exit(1);
}
