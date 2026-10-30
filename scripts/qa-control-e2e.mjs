import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.OPS_URL || "http://localhost:3002").replace(/\/$/, "");
const managerUser = process.env.OPS_MANAGER_USER || "quanly";
const receptionUser = process.env.OPS_RECEPTION_USER || "tuyen";
const password = process.env.OPS_PASSWORD || "123456";
const runId = process.env.QA_RUN_ID || `CONTROL-${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}`;
const guest = `E2E Control ${runId.slice(-8)}`;
const deposit = 123_456;
const resolveNote = `E2E đã kiểm tra cọc ${runId}`;
const outDir = join(root, "qa", "evidence", runId);

mkdirSync(outDir, { recursive: true });

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const results = [];
let bookingPath = "";
let room = "";

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(350);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await ready();
}

async function login(username) {
  await context.clearCookies();
  await go("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();
}

async function pageText() {
  const body = await page.locator("body").innerText();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .map((element) => element.value || "")
      .join("\n"),
  );
  return `${body}\n${values}`.replace(/[\u00a0\u202f]/g, " ");
}

async function must(needles, excluded = []) {
  const text = await pageText();
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
  const found = excluded.filter((needle) => text.includes(needle));
  if (found.length) throw new Error(`Không được có: ${found.join(" | ")} · URL ${page.url()}`);
}

async function pickOpenRoom() {
  const board = page.locator(".night-board");
  await board.waitFor({ timeout: 15_000 });
  const stay = board.getByRole("button", { name: "Cả kỳ", exact: true }).first();
  if (!(await stay.count())) throw new Error("Không còn phòng trống cả kỳ");
  const label = await stay.locator("xpath=ancestor::tr[1]").locator("th span").first().innerText();
  const number = (label.match(/P\.(\S+)/) || [])[1] || "";
  await stay.click();
  if (!number) throw new Error("Không đọc được số phòng");
  return number;
}

async function createBadDepositBooking() {
  await go("/sales/new");
  room = await pickOpenRoom();
  await page.locator('input[name="guestName"]').fill(guest);
  await page.locator('input[name="guestPhone"]').fill("0901000998");
  await page.locator('input[name="deposit"]').fill(String(deposit));
  const method = page.locator('input[type="radio"][name="paymentMethod"][value="personal"]');
  await method.waitFor({ state: "visible", timeout: 10_000 });
  await method.check();
  const checkinNow = page.locator('input[name="checkinNow"]');
  if (await checkinNow.count()) await checkinNow.uncheck();

  await page.getByRole("button", { name: /^Lưu/ }).click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận lưu booking" });
  await dialog.waitFor({ timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/sales\/bookings\/[^/]+$/, { timeout: 30_000 }),
    dialog.getByRole("button", { name: /Lưu/ }).click(),
  ]);
  await ready();
  bookingPath = new URL(page.url()).pathname;
}

async function cleanupBooking() {
  if (!bookingPath) return;
  await login(managerUser);
  await go(bookingPath);
  const cancel = page.getByRole("button", { name: "Hủy booking", exact: true });
  if (!(await cancel.count())) return;
  await cancel.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10_000 });
  const refunded = dialog.getByRole("checkbox");
  if (await refunded.count()) await refunded.check();
  await dialog.getByRole("button", { name: "Hủy booking", exact: true }).click();
  await page.getByText("Hủy", { exact: true }).first().waitFor({ timeout: 30_000 }).catch(() => {});
}

async function check(id, title, fn) {
  const row = {
    id,
    title,
    result: "fail",
    evidence: `qa/evidence/${runId}/${id}.png`,
    note: "",
  };
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

try {
  await check("CTRL-01", "Lễ tân không truy cập được trang Kiểm soát", async () => {
    await login(receptionUser);
    await go("/control");
    if (new URL(page.url()).pathname === "/control") throw new Error("Lễ tân vẫn vào được /control");
    await must(["Đặt phòng"], ["Phát hiện lệch tiền và trạng thái booking"]);
  });

  await check("CTRL-02", "Quản lý thấy đủ 10 nhóm cảnh báo", async () => {
    await login(managerUser);
    await go("/control");
    const cards = page.locator('section[aria-label="Số cảnh báo theo loại"] a');
    if (await cards.count() !== 10) throw new Error(`Số nhóm cảnh báo: ${await cards.count()}, cần 10`);
    await must([
      "Kiểm soát",
      "Thu thiếu tiền",
      "Quá hạn chưa đến",
      "Quá ngày trả",
      "Công nợ OTA",
      "Chờ duyệt sửa",
      "Trùng phòng",
      "Tổng tiền bằng 0",
      "Hoàn vượt tiền thu",
      "Cọc sai tài khoản",
      "OTA thiếu điện thoại",
    ]);
  });

  await check("CTRL-03", "Tạo booking cọc CK cá nhân để phát sinh cảnh báo", async () => {
    await createBadDepositBooking();
    await must([guest, `P.${room}`, "123.456₫", "CK cá nhân"]);
  });

  await check("CTRL-04", "Bộ lọc cọc sai tài khoản hiện đúng booking", async () => {
    if (!bookingPath) throw new Error("Booking kiểm thử chưa được tạo");
    await go("/control?kind=bad_deposit_method");
    const article = page.locator("article").filter({ hasText: guest });
    await article.waitFor({ timeout: 15_000 });
    await must(["Cọc sai tài khoản", guest, "Cọc 123.456₫ không qua CK công ty", "Đã xử lý"]);
    if (!new URL(page.url()).searchParams.has("kind")) throw new Error("Bộ lọc không được giữ trên URL");
  });

  await check("CTRL-05", "Resolve yêu cầu ghi chú và ẩn cảnh báo", async () => {
    if (!bookingPath) throw new Error("Booking kiểm thử chưa được tạo");
    const article = page.locator("article").filter({ hasText: guest });
    const note = article.getByRole("textbox", { name: "Ghi chú xử lý" });
    const submit = article.getByRole("button", { name: "Đã xử lý" });
    if (await note.evaluate((element) => element.checkValidity())) {
      throw new Error("Ghi chú resolve chưa được đánh dấu bắt buộc");
    }
    await note.fill(resolveNote);
    await Promise.all([
      page.waitForURL(/resolved=1/, { timeout: 30_000 }),
      submit.click(),
    ]);
    await ready();
    await must(["Đã ghi nhận xử lý cảnh báo."], [guest]);
  });

  await check("CTRL-06", "Resolve được lưu sau khi tải lại", async () => {
    if (!bookingPath) throw new Error("Booking kiểm thử chưa được tạo");
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready();
    await must(["Cọc sai tài khoản"], [guest]);
  });
} finally {
  await cleanupBooking().catch((error) => {
    console.error("WARN cleanup booking", String(error?.message || error).slice(0, 300));
  });
  await browser.close();
}

const pass = results.filter((row) => row.result === "pass").length;
const fail = results.filter((row) => row.result === "fail").length;
const rate = results.length ? Math.round((pass / results.length) * 100) : 0;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit: gitCommit(),
  env: base,
  guest,
  room,
  bookingPath,
  pass,
  fail,
  total: results.length,
  passRate: `${rate}%`,
  results,
};

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  ${pass}/${results.length} = ${rate}%`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
if (fail) process.exitCode = 1;
