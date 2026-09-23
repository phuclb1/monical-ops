import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.OPS_URL || "http://localhost:3002";
const receptionUser = process.env.OPS_RECEPTION_USER || "tuyen";
const hkUser = process.env.OPS_HK_USER || "uyen";
const password = process.env.OPS_PASSWORD || "123456";
const GUEST = process.env.OPS_GUEST || "E2E Van A";
const ROOM = process.env.OPS_ROOM || "101";
const STANDBY = `Standby P.${ROOM}`;
const STAYOVER = `Dọn phòng khách ở P.${ROOM}`;
const INSPECT = `Kiểm phòng trả P.${ROOM}`;
const CHECKOUT_CLEAN = `Dọn phòng trả P.${ROOM}`;

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `E2E-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const results = [];

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready();
}

async function login(username) {
  await go("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();
}

async function logout() {
  await go("/more");
  const btn = page.getByRole("button", { name: /Đăng xuất/ });
  if (await btn.count()) {
    await btn.click();
    await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => go("/login"));
    await ready();
  }
}

async function asReception() {
  await logout();
  await login(receptionUser);
}

async function asHk() {
  await logout();
  await login(hkUser);
}

async function openGuestHandoff() {
  await go("/sales/bookings");
  await page.getByRole("link").filter({ hasText: GUEST }).first().click();
  await ready();
  await page.getByRole("link", { name: new RegExp(`P\\.${ROOM}.*Giao việc HK`) }).click();
  await page.waitForURL(/\/sales\/(?!bookings)/, { timeout: 20000 });
  await ready();
}

async function completeOpenTask(needle) {
  await go("/tasks");
  await page.getByRole("link").filter({ hasText: needle }).first().click();
  await page.waitForURL(/\/tasks\/(?!new)/, { timeout: 20000 });
  await ready();
  const ticks = page.locator("button.hit-check");
  const n = await ticks.count();
  for (let i = 0; i < n; i += 1) {
    await ticks.nth(i).click();
    await ready();
  }
  await page.locator('select[name="status"]').selectOption("done");
  await page.getByRole("button", { name: "Lưu trạng thái" }).click();
  await ready();
}

async function pageText() {
  const body = await page.locator("body").innerText();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].map((el) => el.value || "").join("\n"),
  );
  return `${body}\n${values}`.replace(/[\u00a0\u202f]/g, " ");
}

async function must(shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const text = await pageText();
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
  return text;
}

async function mustNot(shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const text = await pageText();
  const found = needles.filter((n) => text.includes(n));
  if (found.length) throw new Error(`Không được có: ${found.join(" | ")} · URL ${page.url()}`);
  return text;
}

async function pickOpenRoom() {
  const boxes = page.locator('input[name="roomId"][type="checkbox"]');
  const n = await boxes.count();
  if (!n) throw new Error("Không còn phòng trống");
  const box = boxes.first();
  const id = await box.getAttribute("value");
  await box.scrollIntoViewIfNeeded();
  if (!(await box.isChecked())) await box.check();
  for (let i = 1; i < n; i += 1) {
    const item = boxes.nth(i);
    if (await item.isChecked()) await item.uncheck();
  }
  return String(id || "").replace(/^r-/, "");
}

async function check(id, title, fn) {
  const row = { id, title, result: "fail", evidence: "", note: "" };
  try {
    const shot = join(outDir, `${id}.png`);
    await fn(shot);
    row.result = "pass";
    row.evidence = `qa/evidence/${runId}/${id}.png`;
  } catch (error) {
    row.note = String(error.message || error).slice(0, 280);
    const shot = join(outDir, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    row.evidence = `qa/evidence/${runId}/${id}.png`;
    row.result = "fail";
    console.error(`FAIL ${id}`, row.note);
  }
  results.push(row);
  console.log(`${row.result.toUpperCase()} ${id}  ${title}`);
}

try {
  await check("E2E-R1", "Lễ tân vào Today — ca đang mở + đầu ca", async (shot) => {
    await login(receptionUser);
    const text = await pageText();
    if (text.includes("Chưa mở ca") || text.includes("Mở ca hiện tại")) {
      await page.getByRole("button", { name: /Mở ca hiện tại|Mở ca/ }).click();
      await ready();
    }
    await must(shot, ["Ca đang làm", "Đầu ca"]);
  });

  await check("E2E-R2", "Tick 1 mục checklist đầu ca", async (shot) => {
    await go("/shifts");
    const open = page.locator("section").filter({ hasText: "Đầu ca" }).first();
    await open.waitFor({ timeout: 15000 });
    await open.locator("button.hit-check").first().click();
    await ready();
    await must(shot, ["Đầu ca", "Đang mở"]);
  });

  await check("E2E-R3", "Bán P.101 — giữ chỗ, cọc, chưa nhận", async (shot) => {
    await go("/sales/new");
    const box101 = page.locator("label").filter({ hasText: `P.${ROOM}` }).locator('input[name="roomId"]');
    if (await box101.count()) {
      if (!(await box101.isChecked())) await box101.check();
    }
    const extras = page.locator('input[name="roomId"][type="checkbox"]');
    const n = await extras.count();
    for (let i = 0; i < n; i += 1) {
      const box = extras.nth(i);
      const val = await box.getAttribute("value");
      if (val !== `r-${ROOM}` && (await box.isChecked())) await box.uncheck();
    }
    await page.locator('input[name="guestName"]').fill(GUEST);
    await page.locator('input[name="guestPhone"]').fill("0900000101");
    await page.locator('input[name="deposit"]').fill("200000");
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await Promise.all([
      page.waitForURL(/\/sales\/bookings\//, { timeout: 25000 }),
      page.getByRole("button", { name: /Lưu/ }).click(),
    ]);
    await ready();
    await must(shot, [GUEST, `P.${ROOM}`, "Đã đặt cọc", "Còn phải thu", "Đã giữ"]);
  });

  await check("E2E-R4", "Sơ đồ ngày hiện booking E2E", async (shot) => {
    await go("/sales");
    await must(shot, [GUEST, `P.${ROOM}`]);
  });

  await check("E2E-S1", "Tìm booking theo tên — tab mặc định gồm đã giữ", async (shot) => {
    await go(`/sales/bookings?q=${encodeURIComponent(GUEST)}`);
    await must(shot, [GUEST, "Tìm booking", "Đã giữ", "Đang mở / đã trả"]);
  });

  await check("E2E-R5", "Gửi HK kiểm phòng standby — chưa cho nhận", async (shot) => {
    await openGuestHandoff();
    await page.getByRole("button", { name: "Yêu cầu HK kiểm phòng standby" }).click();
    await page.getByText(STANDBY).waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [STANDBY, GUEST, "Chờ HK hoàn thành kiểm standby rồi mới nhận phòng"]);
  });

  await check("E2E-H1", "HK login — không vào bán phòng", async (shot) => {
    await asHk();
    await go("/sales");
    await ready();
    if (page.url().includes("/sales")) throw new Error("HK vẫn vào được /sales");
    await must(shot, ["Thêm"]);
  });

  await check("E2E-H2", "HK hoàn tất standby P.101", async (shot) => {
    await completeOpenTask(STANDBY);
    await must(shot, [STANDBY, GUEST, "Hoàn tất"]);
  });

  await check("E2E-R6", "Lễ tân nhận phòng sau khi HK standby xong", async (shot) => {
    await asReception();
    await openGuestHandoff();
    await page.getByRole("button", { name: "Nhận phòng" }).click();
    await page.getByText("Đang ở", { exact: false }).first().waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [GUEST, "Đang ở", "Yêu cầu HK dọn phòng khách ở"]);
  });

  await check("E2E-R8", "Lễ tân gửi HK dọn phòng khách ở", async (shot) => {
    await openGuestHandoff();
    await page.getByRole("button", { name: "Yêu cầu HK dọn phòng khách ở" }).click();
    await page.getByText(STAYOVER).waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [STAYOVER, GUEST, "Dọn khi khách đang ở"]);
  });

  await check("E2E-H3", "HK thấy việc dọn khách ở", async (shot) => {
    await asHk();
    await go("/tasks");
    await must(shot, [STAYOVER, "Dọn phòng khách ở"]);
  });

  await check("E2E-H4", "HK hoàn tất dọn phòng khách ở", async (shot) => {
    await completeOpenTask(STAYOVER);
    await must(shot, [STAYOVER, "Hoàn tất"]);
  });

  await check("E2E-R13", "Lễ tân gửi HK kiểm phòng trước trả", async (shot) => {
    await asReception();
    await openGuestHandoff();
    await page.getByRole("button", { name: "Yêu cầu HK kiểm phòng trả" }).click();
    await page.getByText(INSPECT).waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [INSPECT, GUEST, "Chờ HK kiểm phòng xong rồi mới hoàn tất trả phòng"]);
  });

  await check("E2E-H7", "HK hoàn tất kiểm phòng trả", async (shot) => {
    await asHk();
    await completeOpenTask(INSPECT);
    await must(shot, [INSPECT, "Hoàn tất"]);
  });

  await check("E2E-R14", "Lễ tân hoàn tất trả phòng", async (shot) => {
    await asReception();
    await openGuestHandoff();
    await page.getByRole("button", { name: "Hoàn tất trả phòng" }).click();
    await page.getByText("Đã trả", { exact: false }).first().waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [GUEST, "Đã trả"]);
  });

  await check("E2E-S2", "Tab mặc định + tìm kiếm hiện booking đã trả", async (shot) => {
    await go(`/sales/bookings?q=${encodeURIComponent(GUEST)}`);
    await must(shot, [GUEST, "Đã trả", "Đang mở / đã trả"]);
  });

  await check("E2E-H8", "HK thấy việc dọn trả tự tạo", async (shot) => {
    await asHk();
    await go("/tasks");
    await must(shot, [CHECKOUT_CLEAN, GUEST]);
  });

  await check("E2E-R9", "Filter Phòng bẩn có P.101 sau trả", async (shot) => {
    await asReception();
    await go("/rooms?focus=dirty");
    await must(shot, ["Phòng bẩn", `P.${ROOM}`]);
  });

  await check("E2E-H5", "HK chuyển status phòng nếu được", async (shot) => {
    await asHk();
    await go(`/rooms/r-${ROOM}`);
    const next = page.getByRole("button", { name: /Chuyển →/ });
    if (await next.count()) {
      await next.click();
      await ready();
    }
    await must(shot, [`P.${ROOM}`]);
  });

  await check("E2E-H6", "Phòng bẩn không còn khách E2E sau dọn trả", async (shot) => {
    await completeOpenTask(CHECKOUT_CLEAN).catch(() => {});
    await go("/rooms?focus=dirty");
    const text = await must(shot, ["Phòng bẩn"]);
    if (text.includes(GUEST)) throw new Error("Filter bẩn vẫn còn khách E2E sau khi việc xong");
  });

  await check("E2E-R12", "Lễ tân không vào nhật ký", async (shot) => {
    await asReception();
    await go("/audit");
    await ready();
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes("Nhật ký thao tác") && text.includes("Người làm")) {
      throw new Error("Lễ tân vẫn xem được nhật ký");
    }
  });

  await check("E2E-R11", "Bàn giao còn trang gom việc", async (shot) => {
    await go("/handover");
    await must(shot, ["Bàn giao"]);
  });

  await check("E2E-R10", "Cuối ca hiện trên ca đang mở", async (shot) => {
    await go("/shifts");
    await must(shot, ["Cuối ca", "Đang mở"]);
  });

  await check("E2E-O1", "Booking OTA — công nợ, không cọc, không thu đủ", async (shot) => {
    await go("/sales/new");
    await page.locator('select[name="source"]').selectOption("agoda");
    const room = await pickOpenRoom();
    await page.locator('input[name="guestName"]').fill("E2E OTA");
    await page.locator('input[name="guestPhone"]').fill("0900000104");
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    const deposit = page.locator('input[name="deposit"]');
    if (await deposit.count()) {
      const visible = await deposit.evaluate((el) => el.type !== "hidden" && el.offsetParent !== null);
      if (visible) throw new Error("Form OTA vẫn hỏi đặt cọc");
    }
    await must(shot, ["Công nợ OTA", "Agoda", "Xuất hóa đơn"]);
    await mustNot(shot, ["Đặt cọc", "Thu đủ", "Chưa cọc", "Từ ezCloud"]);
    await Promise.all([
      page.waitForURL(/\/sales\/bookings\//, { timeout: 25000 }),
      page.getByRole("button", { name: /Lưu/ }).click(),
    ]);
    await ready();
    await must(shot, ["E2E OTA", `P.${room}`, "Công nợ OTA", "Agoda", "Đã giữ", "Không xuất hóa đơn"]);
    await mustNot(shot, ["Đặt cọc", "Thu đủ", "Chưa cọc", "Còn phải thu"]);
  });

  await check("E2E-X1", "Tạo booking kèm phụ thu", async (shot) => {
    await go("/sales/new");
    const room = await pickOpenRoom();
    await page.locator('input[name="guestName"]').fill("E2E Phu Thu");
    await page.locator('input[name="guestPhone"]').fill("0900000205");
    const service = page.locator("label").filter({ hasText: "Dịch vụ" }).locator("select");
    await service.selectOption("other");
    await page.getByPlaceholder("Xe đón, hoa...").fill("Xe đón sân bay");
    await page.getByPlaceholder("50000").fill("150000");
    await page.getByRole("button", { name: "Thêm phụ thu" }).click();
    await page.getByRole("checkbox", { name: "Xuất hóa đơn" }).check();
    await page.locator("p").filter({ hasText: "Xe đón sân bay" }).first().waitFor({ timeout: 10000 });
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await must(shot, ["Xe đón sân bay", "150.000₫"]);
    await Promise.all([
      page.waitForURL(/\/sales\/bookings\//, { timeout: 25000 }),
      page.getByRole("button", { name: /Lưu/ }).click(),
    ]);
    await ready();
    await must(shot, ["E2E Phu Thu", `P.${room}`, "Xe đón sân bay", "150.000₫", "Đã giữ", "Yêu cầu xuất hóa đơn"]);
  });

  await check("E2E-O4", "Booking OTA — khách thanh toán tại khách sạn", async (shot) => {
    await go("/sales/new");
    await page.locator('select[name="source"]').selectOption("agoda");
    await page.locator('select[name="otaPaymentMode"]').selectOption("hotel");
    const room = await pickOpenRoom();
    const selectedRoomId = await page.locator('input[name="roomId"]:checked').inputValue();
    await page.locator(`input[name="rate-${selectedRoomId}"]`).fill("900000");
    await page.locator('input[name="guestName"]').fill("E2E OTA Tai KS");
    await page.locator('input[name="guestPhone"]').fill("0900000306");
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await must(shot, ["Thanh toán tại KS", "Công nợ OTA", "0₫", "Phải thu khi check-in"]);
    await mustNot(shot, ["Đặt cọc", "Chưa đặt cọc"]);
    await Promise.all([
      page.waitForURL(/\/sales\/bookings\//, { timeout: 25000 }),
      page.getByRole("button", { name: /Lưu/ }).click(),
    ]);
    await ready();
    await must(shot, [
      "E2E OTA Tai KS",
      `P.${room}`,
      "Thanh toán tại KS",
      "Công nợ OTA 0₫",
      "Còn khách thanh toán",
      "Thu thêm — trống = thu đủ",
    ]);
  });

  await check("E2E-O2", "Báo cáo doanh thu OTA chưa trừ hoa hồng", async (shot) => {
    await logout();
    await login("quanly");
    await go("/reports/sales");
    await must(shot, ["Doanh thu OTA", "trước hoa hồng", "chưa trừ hoa hồng", "E2E OTA", "Công nợ OTA"]);
  });

  await check("E2E-O3", "Chủ sở hữu thấy doanh thu OTA", async (shot) => {
    await logout();
    await login("chusohuu");
    await go("/owner");
    await must(shot, ["DOANH THU OTA", "chưa trừ hoa hồng", "E2E OTA"]);
  });
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.result === "pass").length;
const fail = results.filter((r) => r.result === "fail").length;
const rate = results.length ? Math.round((pass / results.length) * 100) : 0;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit,
  env: base,
  guest: GUEST,
  room: ROOM,
  pass,
  fail,
  total: results.length,
  passRate: `${rate}%`,
  results,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  commit ${commit}  ${pass}/${results.length} = ${rate}%`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
if (fail) process.exitCode = 1;
