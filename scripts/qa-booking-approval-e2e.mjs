import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.OPS_URL || "http://localhost:3002").replace(/\/$/, "");
const receptionUser = process.env.OPS_RECEPTION_USER || "ngan.lt";
const managerUser = process.env.OPS_MANAGER_USER || "quanly";
const password = process.env.OPS_PASSWORD || "123456";
const runId =
  process.env.QA_RUN_ID ||
  `APPROVAL-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const guest = process.env.OPS_GUEST || `E2E Duyet ${runId.slice(-12)}`;
const rejectReason = `E2E từ chối ${runId}`;
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
let bookingUrl = "";
let room = "";

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready();
}

async function login(username) {
  await context.clearCookies();
  await go("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
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

async function assertText(needles, excluded = []) {
  const text = await pageText();
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
  const found = excluded.filter((needle) => text.includes(needle));
  if (found.length) throw new Error(`Không được có: ${found.join(" | ")} · URL ${page.url()}`);
  return text;
}

async function pickOpenRoom() {
  const boxes = page.locator('input[name="roomId"][type="checkbox"]');
  const count = await boxes.count();
  if (!count) throw new Error("Không còn phòng trống để tạo booking E2E");
  const selected = boxes.first();
  const id = await selected.getAttribute("value");
  await selected.check();
  for (let index = 1; index < count; index += 1) {
    const box = boxes.nth(index);
    if (await box.isChecked()) await box.uncheck();
  }
  return String(id || "").replace(/^r-/, "");
}

async function openEdit() {
  await page.locator("summary").filter({ hasText: "Sửa booking" }).click();
  await page.locator('input[name="deposit"]').waitFor({ state: "visible", timeout: 15000 });
  await page.getByText("Thu đủ khi check-in (₫)", { exact: true }).waitFor({ timeout: 15000 });
}

async function requestDeposit(amount) {
  await openEdit();
  await page.locator('input[name="deposit"]').fill(String(amount));
  await page.getByRole("button", { name: "Gửi phê duyệt", exact: true }).waitFor();
  await Promise.all([
    page.waitForURL(/approval=requested/, { timeout: 30000 }),
    page.getByRole("button", { name: "Gửi phê duyệt", exact: true }).click(),
  ]);
  await ready();
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

async function cleanupBooking() {
  if (!bookingUrl) return;
  await login(managerUser);
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
  await check("APP-A1", "Lễ tân tạo booking kiểm thử với cọc 100.000₫", async () => {
    await login(receptionUser);
    await go("/sales/new");
    room = await pickOpenRoom();
    await page.locator('input[name="guestName"]').fill(guest);
    await page.locator('input[name="guestPhone"]').fill("0900000299");
    await page.locator('input[name="deposit"]').fill("100000");
    const checkinNow = page.locator('input[name="checkinNow"]');
    if (await checkinNow.count()) await checkinNow.uncheck();
    await Promise.all([
      page.waitForURL(/\/sales\/bookings\//, { timeout: 30000 }),
      page.getByRole("button", { name: /Lưu/ }).click(),
    ]);
    await ready();
    bookingUrl = new URL(page.url()).pathname;
    await assertText([guest, `P.${room}`, "Đã đặt cọc 100.000₫"]);
  });

  await check("APP-A2", "Đổi tiền hiện nút Gửi phê duyệt và chưa áp dụng booking", async () => {
    await requestDeposit(200000);
    await assertText(
      ["Đã gửi quản lý duyệt. Booking chưa thay đổi.", "Chờ quản lý duyệt", "điều chỉnh tiền đã thu", "Đã đặt cọc 100.000₫"],
      ["Đã đặt cọc 200.000₫"],
    );
  });

  await check("APP-A3", "Quản lý chỉ thấy Chấp nhận/Từ chối và lý do là bắt buộc", async () => {
    await login(managerUser);
    await go(bookingUrl);
    const pending = page.locator("article").filter({ hasText: "Chờ quản lý duyệt" }).first();
    await pending.waitFor({ timeout: 15000 });
    const actions = await pending
      .getByRole("button")
      .allTextContents();
    const normalized = actions.map((value) => value.trim()).filter(Boolean);
    if (JSON.stringify(normalized) !== JSON.stringify(["Chấp nhận", "Từ chối"])) {
      throw new Error(`Nút duyệt không đúng: ${normalized.join(", ")}`);
    }
    await pending.getByRole("button", { name: "Từ chối", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Từ chối thay đổi?" });
    await dialog.waitFor();
    const reason = dialog.locator('textarea[name="reviewNote"]');
    if (await reason.evaluate((element) => element.checkValidity())) {
      throw new Error("Lý do từ chối chưa được đánh dấu bắt buộc");
    }
    await dialog.getByRole("button", { name: "Xác nhận từ chối" }).click();
    await page.waitForTimeout(300);
    if (!(await dialog.isVisible())) throw new Error("Modal đóng dù chưa nhập lý do");
    await reason.fill(rejectReason);
  });

  await check("APP-A4", "Quản lý từ chối, lý do và lịch sử được lưu", async () => {
    const dialog = page.getByRole("dialog", { name: "Từ chối thay đổi?" });
    await Promise.all([
      page.waitForURL(/approval=rejected/, { timeout: 30000 }),
      dialog.getByRole("button", { name: "Xác nhận từ chối" }).click(),
    ]);
    await ready();
    await assertText(
      ["Đã từ chối đề nghị thay đổi.", rejectReason, "Gửi duyệt", "Từ chối", "Đã đặt cọc 100.000₫"],
      ["Đã đặt cọc 200.000₫"],
    );
  });

  await check("APP-A5", "Lễ tân gửi lại đề nghị điều chỉnh tiền", async () => {
    await login(receptionUser);
    await go(bookingUrl);
    await requestDeposit(300000);
    await assertText(
      ["Đã gửi quản lý duyệt. Booking chưa thay đổi.", "Chờ quản lý duyệt", "Đã đặt cọc 100.000₫"],
      ["Đã đặt cọc 300.000₫"],
    );
  });

  await check("APP-A6", "Quản lý chấp nhận đề nghị", async () => {
    await login(managerUser);
    await go(bookingUrl);
    const pending = page.locator("article").filter({ hasText: "Chờ quản lý duyệt" }).first();
    await Promise.all([
      page.waitForURL(/approval=approved/, { timeout: 30000 }),
      pending.getByRole("button", { name: "Chấp nhận", exact: true }).click(),
    ]);
    await ready();
    await assertText(
      ["Đã duyệt và áp dụng thay đổi vào booking.", "Đã duyệt", "Đã đặt cọc 300.000₫", "Gửi duyệt", "Từ chối", rejectReason],
      ["Chờ quản lý duyệt", "Đã đặt cọc 100.000₫"],
    );
  });

  await check("APP-A7", "Lễ tân thấy kết quả duyệt và toàn bộ lịch sử", async () => {
    await login(receptionUser);
    await go(bookingUrl);
    await assertText(
      ["Đã duyệt", "Đã từ chối", "Đã đặt cọc 300.000₫", "Gửi duyệt", "Từ chối", rejectReason],
      ["Chấp nhận", "Xác nhận từ chối"],
    );
  });

  await check("APP-A9", "Sửa riêng thu check-in, đặt cọc chưa đổi và chưa áp dụng", async () => {
    await login(receptionUser);
    await go(bookingUrl);
    await openEdit();
    await page.locator('input[name="checkinPaid"]').fill("50000");
    await page.getByRole("button", { name: "Gửi phê duyệt", exact: true }).waitFor();
    await Promise.all([
      page.waitForURL(/approval=requested/, { timeout: 30000 }),
      page.getByRole("button", { name: "Gửi phê duyệt", exact: true }).click(),
    ]);
    await ready();
    await assertText(["sửa thu check-in", "Đã đặt cọc 300.000₫", "Chờ quản lý duyệt"], ["Thu đủ khi check-in 50.000₫"]);
  });

  await check("APP-A10", "Quản lý duyệt thu check-in; đặt cọc giữ nguyên", async () => {
    await login(managerUser);
    await go(bookingUrl);
    const pending = page.locator("article").filter({ hasText: "Chờ quản lý duyệt" }).first();
    await pending.waitFor({ timeout: 15000 });
    if (!(await pending.innerText()).includes("sửa thu check-in")) {
      throw new Error("Phiếu duyệt không ghi sửa thu check-in");
    }
    await Promise.all([
      page.waitForURL(/approval=approved/, { timeout: 30000 }),
      pending.getByRole("button", { name: "Chấp nhận", exact: true }).click(),
    ]);
    await ready();
    await assertText(["Thu đủ khi check-in 50.000₫", "Đã đặt cọc 300.000₫", "Đã duyệt"]);
  });

  await check("APP-A8", "Dọn dữ liệu: quản lý hủy booking kiểm thử", async () => {
    await login(managerUser);
    await go(bookingUrl);
    await page.getByRole("button", { name: "Hủy booking", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Xác nhận đã hoàn cọc" });
    await dialog.getByRole("checkbox", { name: /Đã hoàn cọc/ }).check();
    await Promise.all([
      page.getByText("Hủy", { exact: true }).first().waitFor({ timeout: 30000 }),
      dialog.getByRole("button", { name: "Hủy booking", exact: true }).click(),
    ]);
    await ready();
    await assertText([guest, "Hủy"]);
  });
} finally {
  await cleanupBooking().catch((error) => {
    console.error("WARN cleanup booking", String(error?.message || error).slice(0, 240));
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
  bookingUrl,
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
