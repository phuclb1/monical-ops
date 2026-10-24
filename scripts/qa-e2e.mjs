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
const REMOVED_OPS = ["/today", "/tasks", "/handover", "/shifts", "/reception", "/rooms", "/forms", "/incidents", "/roster"];

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `E2E-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const EXPENSE_NOTE = `E2E chi bep ${runId}`;
const EXPENSE_PAYER = `E2E Ngan ${runId}`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const results = [];
let bookedRoom = ROOM;
let guestBookingPath = "";

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

async function openGuestBooking() {
  if (guestBookingPath) {
    await go(guestBookingPath);
    await waitForBookingReady(GUEST);
    return;
  }
  await go(`/sales/bookings?q=${encodeURIComponent(GUEST)}`);
  await page.getByRole("link").filter({ hasText: GUEST }).first().click();
  await page.waitForURL(/\/sales\/bookings\/[^/]+$/, { timeout: 20000 });
  await waitForBookingReady(GUEST);
}

function todayVN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

async function fillNewPayer(name) {
  const picker = page.locator("select").filter({ has: page.locator('option[value="__new__"]') });
  if (await picker.count()) await picker.selectOption("__new__");
  await page.getByPlaceholder("Nhập tên người chi").fill(name);
}

async function assertNoExpenses(shot) {
  await go("/more");
  const more = await pageText();
  if (more.includes("Chi phí — ngày chi")) throw new Error("Menu Chi phí hiện với role không được nhập");
  await go("/expenses");
  if (new URL(page.url()).pathname.startsWith("/expenses")) throw new Error("Vẫn vào được /expenses");
  await mustNot(shot, ["Nhập chi phí", "Lưu khoản chi"]);
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

async function waitForBookingReady(guest) {
  await page.locator('main[aria-busy="true"]').waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
  const heading = guest
    ? page.getByRole("heading", { name: guest }).first()
    : page.locator("main h1").first();
  await heading.waitFor({ state: "visible", timeout: 45000 });
  await ready();
}

async function saveBooking(guest) {
  await page.getByRole("button", { name: /Lưu/ }).click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận lưu booking" });
  await dialog.waitFor({ timeout: 10000 });
  await Promise.all([
    page.waitForURL(/\/sales\/bookings\//, { timeout: 25000 }),
    dialog.getByRole("button", { name: /Lưu|Gửi phê duyệt/ }).click(),
  ]);
  await waitForBookingReady(guest);
}

async function pickOpenRoom() {
  const preferred = page.locator("label").filter({ hasText: `P.${ROOM}` }).locator('input[name="roomId"]');
  if (await preferred.count()) {
    if (!(await preferred.isChecked())) await preferred.check();
    const extras = page.locator('input[name="roomId"][type="checkbox"]');
    const n = await extras.count();
    for (let i = 0; i < n; i += 1) {
      const box = extras.nth(i);
      const val = await box.getAttribute("value");
      if (val !== `r-${ROOM}` && (await box.isChecked())) await box.uncheck();
    }
    return ROOM;
  }
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

async function collectDue() {
  const pay = page.getByRole("button", { name: /^Thu đủ/ });
  if (!(await pay.count())) return;
  await pay.first().click();
  await page.getByText("Đã thu đủ", { exact: false }).waitFor({ timeout: 30000 });
  await ready();
}

async function cancelOpenBooking(name) {
  await go(`/sales/bookings?q=${encodeURIComponent(name)}`);
  const link = page.getByRole("link").filter({ hasText: name }).first();
  if (!(await link.count())) return;
  await link.click();
  await page.waitForURL(/\/sales\/bookings\/[^/]+$/, { timeout: 20000 }).catch(() => {});
  await ready();
  const cancel = page.getByRole("button", { name: "Hủy booking" });
  if (!(await cancel.count())) return;
  await cancel.click();
  await ready();
  const refund = page.locator('input[type="checkbox"]').filter({ hasText: /Đã hoàn cọc/ });
  if (await refund.count()) await refund.check();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Hủy booking" });
  if (await confirm.count()) {
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {}),
      confirm.click(),
    ]);
    await ready();
  }
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
  await check("E2E-R1", "Lễ tân vào Đặt phòng — không còn Today / ca", async (shot) => {
    await login(receptionUser);
    const path = new URL(page.url()).pathname;
    if (path !== "/sales/bookings" && path !== "/") {
      if (!path.startsWith("/sales")) throw new Error(`Home lễ tân không phải đặt phòng · ${page.url()}`);
    }
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Tìm booking", "Đang mở / đã trả"]);
    await mustNot(shot, ["Ca đang làm", "Đầu ca", "Mở ca hiện tại", "Hôm nay", "Bảng việc"]);
  });

  await check("E2E-R3", "Bán phòng — giữ chỗ, cọc, chưa nhận", async (shot) => {
    await go("/sales/new");
    bookedRoom = await pickOpenRoom();
    await page.locator('input[name="guestName"]').fill(GUEST);
    await page.locator('input[name="guestPhone"]').fill("0900000101");
    await page.locator('input[name="deposit"]').fill("200000");
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await saveBooking(GUEST);
    guestBookingPath = new URL(page.url()).pathname;
    await must(shot, [GUEST, `P.${bookedRoom}`, "Đã đặt cọc", "Còn phải thu", "Đã giữ"]);
    await mustNot(shot, ["Giao việc HK", "Yêu cầu HK kiểm phòng standby"]);
  });

  await check("E2E-R4", "Sơ đồ ngày hiện booking E2E", async (shot) => {
    await go("/sales");
    await must(shot, [GUEST, `P.${bookedRoom}`, "Sơ đồ phòng"]);
    await mustNot(shot, ["Doanh thu khung", "Phòng bẩn"]);
  });

  await check("E2E-S1", "Tìm booking theo tên — tab mặc định gồm đã giữ", async (shot) => {
    await go(`/sales/bookings?q=${encodeURIComponent(GUEST)}`);
    await must(shot, [GUEST, "Tìm booking", "Giữ chỗ", "Đang mở / đã trả"]);
  });

  await check("E2E-S3", "Danh sách đặt phòng chỉ render một trang", async (shot) => {
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Tìm booking", "Mới nhất", "Đang mở / đã trả"]);
    const links = await page.locator('a[href^="/sales/bookings/"]').count();
    if (links > 80) throw new Error(`Render ${links} booking link, vượt một trang`);
    await go("/sales/bookings?tab=all&page=2");
    const text = await must(shot, ["Đặt phòng", "Tất cả"]);
    if (text.includes("Application error")) throw new Error("Trang 2 lỗi");
    const pageLinks = await page.locator('a[href^="/sales/bookings/"]').count();
    if (pageLinks > 80) throw new Error(`Trang 2 render ${pageLinks} booking link`);
  });

  await check("E2E-R6", "Lễ tân nhận phòng thẳng — không cổng HK", async (shot) => {
    await openGuestBooking();
    await mustNot(shot, ["Yêu cầu HK kiểm phòng standby", "Chờ HK hoàn thành kiểm standby"]);
    const checkin = page.getByRole("button", { name: "Check in" });
    if (!(await checkin.count())) throw new Error("Không có nút Check in trên booking");
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      checkin.first().click(),
    ]);
    await page.getByText("Đang ở", { exact: false }).first().waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [GUEST, "Đang ở"]);
    await mustNot(shot, ["Yêu cầu HK dọn phòng khách ở", "Giao việc HK"]);
  });

  await check("E2E-K1", "Bếp ăn sáng vẫn đọc được booking", async (shot) => {
    await go("/kitchen");
    await must(shot, ["Ăn sáng", "Hôm nay"]);
    await go("/kitchen/forecast");
    await must(shot, ["Người lớn"]);
  });

  await check("E2E-R14a", "Chưa thu đủ thì chưa checkout được", async (shot) => {
    await openGuestBooking();
    const body = await pageText();
    if (body.includes("Đã trả")) throw new Error("Booking đã trả trước khi test cổng thu");
    const checkout = page.getByRole("button", { name: "Check out" });
    if (!(await checkout.count())) throw new Error("Không có nút Check out sau khi nhận");
    if (body.includes("Đã thu đủ") || !body.includes("Còn phải thu")) {
      await must(shot, [GUEST, "Đang ở", "Check out"]);
      return;
    }
    await checkout.first().click();
    await page.getByText("Chưa thu đủ tiền").waitFor({ timeout: 10000 });
    await must(shot, ["Chưa thu đủ tiền", "Thu đủ ở phần Thanh toán"]);
    const close = page.getByRole("button", { name: "Đóng để thu tiền" });
    if (await close.count()) await close.click();
  });

  await check("E2E-R14", "Thu đủ rồi lễ tân trả phòng thẳng", async (shot) => {
    await openGuestBooking();
    if ((await pageText()).includes("Đã trả")) {
      await must(shot, [GUEST, "Đã trả"]);
      return;
    }
    await collectDue();
    await openGuestBooking();
    const checkout = page.getByRole("button", { name: "Check out" });
    if (!(await checkout.count())) throw new Error("Không có nút Check out sau khi thu đủ");
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {}),
      checkout.first().click(),
    ]);
    await page.getByText("Đã trả", { exact: false }).first().waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [GUEST, "Đã trả"]);
    await mustNot(shot, ["Yêu cầu HK kiểm phòng trả", "Dọn phòng trả"]);
  });

  await check("E2E-S2", "Tab mặc định + tìm kiếm hiện booking đã trả", async (shot) => {
    await openGuestBooking();
    await must(shot, [GUEST, "Đã trả"]);
    await go(`/sales/bookings?q=${encodeURIComponent(GUEST)}`);
    await must(shot, [GUEST, "Đã trả", "Đang mở / đã trả"]);
  });

  await check("E2E-H1", "HK bị khóa login — module vận hành tạm dừng", async (shot) => {
    await logout();
    await go("/login");
    await page.locator('input[name="username"]').fill(hkUser);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/\/login/, { timeout: 20000 });
    await ready();
    if (!new URL(page.url()).pathname.startsWith("/login")) throw new Error("HK vẫn vào được app");
    await must(shot, ["Module vận hành tạm dừng"]);
  });

  await check("E2E-R16", "URL điều phối cũ redirect về đặt phòng", async (shot) => {
    await asReception();
    for (const path of REMOVED_OPS) {
      await go(path);
      const current = new URL(page.url()).pathname;
      if (current === path || current.startsWith(`${path}/`)) {
        throw new Error(`URL cũ vẫn mở: ${page.url()}`);
      }
    }
    await must(shot, ["Đặt phòng"]);
  });

  await check("E2E-R12", "Lễ tân không vào nhật ký", async (shot) => {
    await go("/audit");
    await ready();
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes("Nhật ký thao tác") && text.includes("Người làm")) {
      throw new Error("Lễ tân vẫn xem được nhật ký");
    }
  });

  await check("E2E-R15", "Lễ tân không vào báo cáo doanh thu bằng URL trực tiếp", async (shot) => {
    await go("/reports/sales");
    const pathname = new URL(page.url()).pathname;
    if (pathname === "/reports/sales") throw new Error("Lễ tân vẫn vào được /reports/sales");
    await mustNot(shot, ["Báo cáo doanh thu", "Doanh thu booking", "Doanh thu ghi nhận"]);
  });

  await check("E2E-O1", "Booking OTA — công nợ, không cọc, không thu đủ", async (shot) => {
    await go("/sales/new");
    await page.locator('select[name="source"]').selectOption("agoda");
    const room = await pickOpenRoom();
    await page.locator('input[name="otaTotal"]').fill("800000");
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
    await mustNot(shot, ["Đặt cọc", "Thu đủ", "Chưa cọc"]);
    await saveBooking("E2E OTA");
    await must(shot, ["E2E OTA", `P.${room}`, "Công nợ OTA", "Agoda", "Đã giữ", "Yêu cầu xuất hóa đơn"]);
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
    await saveBooking("E2E Phu Thu");
    await must(shot, ["E2E Phu Thu", `P.${room}`, "Xe đón sân bay", "150.000₫", "Đã giữ", "Yêu cầu xuất hóa đơn"]);
  });

  await check("E2E-O4", "Booking OTA — khách thanh toán tại khách sạn", async (shot) => {
    await go("/sales/new");
    await page.locator('select[name="source"]').selectOption("agoda");
    await page.locator('select[name="otaPaymentMode"]').selectOption("hotel");
    const room = await pickOpenRoom();
    await page.locator('input[name="otaTotal"]').fill("900000");
    await page.locator('input[name="guestName"]').fill("E2E OTA Tai KS");
    await page.locator('input[name="guestPhone"]').fill("0900000306");
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await must(shot, ["Thanh toán tại KS", "Công nợ OTA", "0₫", "Phải thu khi check-in"]);
    await mustNot(shot, ["Đặt cọc", "Chưa đặt cọc"]);
    await saveBooking("E2E OTA Tai KS");
    await must(shot, [
      "E2E OTA Tai KS",
      `P.${room}`,
      "Thanh toán tại KS",
      "Công nợ OTA 0₫",
      "Còn khách thanh toán",
      "Số tiền — trống = thu đủ",
    ]);
  });

  await check("E2E-C1", "Lễ tân không vào chi phí", async (shot) => {
    await assertNoExpenses(shot);
  });

  await check("E2E-O2", "Báo cáo doanh thu OTA sau hoa hồng", async (shot) => {
    await logout();
    await login("quanly");
    await go("/reports/sales");
    await must(shot, ["OTA sau hoa hồng", "phải trả hoa hồng", "phải thu đối tác", "OTA đã thu tại KS", "E2E OTA", "Công nợ OTA"]);
  });

  await check("E2E-O5", "OTA công nợ + phụ thu — thu phụ thu vào sổ cái", async (shot) => {
    const guest = "E2E OTA Phu Thu";
    await go("/sales/new");
    await page.locator('select[name="source"]').selectOption("agoda");
    const room = await pickOpenRoom();
    await page.locator('input[name="otaTotal"]').fill("800000");
    await page.locator('input[name="guestName"]').fill(guest);
    await page.locator('input[name="guestPhone"]').fill("0900000407");
    const service = page.locator("label").filter({ hasText: "Dịch vụ" }).locator("select");
    await service.selectOption("other");
    await page.getByPlaceholder("Xe đón, hoa...").fill("Xe đón sân bay");
    await page.getByPlaceholder("50000").fill("150000");
    await page.getByRole("button", { name: "Thêm phụ thu" }).click();
    await page.locator("p").filter({ hasText: "Xe đón sân bay" }).first().waitFor({ timeout: 10000 });
    const now = page.locator('input[name="checkinNow"]');
    if (await now.count()) await now.uncheck();
    await must(shot, ["Công nợ OTA", "800.000₫", "Phụ thu thu tại KS", "150.000₫", "tiền mặt / CK"]);
    await saveBooking(guest);
    await must(shot, [
      guest,
      `P.${room}`,
      "Công nợ OTA 800.000₫",
      "Xe đón sân bay",
      "Phụ thu còn thu 150.000₫",
      "Thu phụ thu tại KS",
    ]);
    await mustNot(shot, ["Đặt cọc", "Còn phải thu"]);
    const pay = page.getByRole("button", { name: /^Thu đủ/ });
    if (!(await pay.count())) throw new Error("Không có nút thu phụ thu trên booking OTA công nợ");
    await pay.first().click();
    await page.getByText("Phụ thu đã thu đủ", { exact: false }).first().waitFor({ timeout: 30000 });
    await ready();
    await must(shot, [guest, "Phụ thu đã thu đủ", "Thu thêm", "150.000₫", "Công nợ OTA 800.000₫"]);
    await go(`/reports/ledger?q=${encodeURIComponent(guest)}`);
    await must(shot, ["Sổ cái", guest, "Thu thêm", "150.000₫", "CK cá nhân"]);
  });

  await check("E2E-CF1", "Dòng tiền một trang, tổng cả kỳ vẫn hiện", async (shot) => {
    await go("/reports/cash");
    await must(shot, ["Báo cáo dòng tiền", "Xuất Excel", "Tiền mặt"]);
    const monthText = (await pageText()).toLocaleLowerCase("vi");
    if (!monthText.includes("tổng gồm vat")) throw new Error("Thiếu tổng gồm VAT");
    const rows = await page.locator(".cash-flow-table tbody tr").count();
    if (rows > 40) throw new Error(`Bảng dòng tiền ${rows} dòng, vượt một trang`);
    if (rows > 0 && !monthText.includes("tổng kỳ")) throw new Error("Thiếu tổng cả kỳ");
    await go("/reports/cash?grain=year&page=2");
    const yearText = await must(shot, ["Báo cáo dòng tiền", "Năm"]);
    if (!yearText.toLocaleLowerCase("vi").includes("tổng gồm vat")) throw new Error("Thiếu tổng gồm VAT của năm");
    const yearRows = await page.locator(".cash-flow-table tbody tr").count();
    if (yearRows > 40) throw new Error(`Dòng tiền năm ${yearRows} dòng, vượt một trang`);
  });

  await check("E2E-C2", "Quản lý mở trang chi phí từ Thêm", async (shot) => {
    await go("/more");
    await page.locator("main").getByRole("link", { name: /Chi phí/ }).click();
    await page.waitForURL(/\/expenses/, { timeout: 20000 });
    await ready();
    const optionText = async (name) =>
      (await page.locator(`select[name="${name}"] option`).allTextContents()).join("\n");
    const categories = await optionText("category");
    const invoice = await optionText("hasInvoice");
    const funds = await optionText("fundedBy");
    const missing = ["Bếp", "Lễ tân", "Khách sạn", "Quản lý"].filter((label) => !categories.includes(label));
    if (!invoice.includes("Có hóa đơn") || !invoice.includes("Không hóa đơn")) missing.push("hóa đơn");
    if (!funds.includes("Tài khoản công ty") || !funds.includes("Tài khoản cá nhân")) missing.push("nguồn tiền");
    if (missing.length) throw new Error(`Thiếu lựa chọn: ${missing.join(" | ")}`);
    await must(shot, ["Chi phí", "Nhập chi phí", "Ngày chi", "Hạng mục chi", "Ai chi", "Tháng", "Quý", "Năm", "Lưu khoản chi"]);
  });

  await check("E2E-C3", "Quản lý nhập khoản chi bếp, có hóa đơn, tài khoản công ty", async (shot) => {
    await go("/expenses");
    await page.locator('input[name="spentOn"]').fill(todayVN());
    await page.locator('select[name="category"]').selectOption("kitchen");
    await page.locator('input[name="amount"]').fill("250000");
    await page.locator('select[name="hasInvoice"]').selectOption("yes");
    await page.locator('select[name="fundedBy"]').selectOption("company");
    await fillNewPayer(EXPENSE_PAYER);
    await page.locator('input[name="note"]').fill(EXPENSE_NOTE);
    await Promise.all([
      page.waitForURL(/[?&]ok=1/, { timeout: 25000 }),
      page.getByRole("button", { name: "Lưu khoản chi" }).click(),
    ]);
    await ready();
    await must(shot, ["Đã lưu khoản chi", EXPENSE_NOTE, EXPENSE_PAYER, "Bếp", "250.000₫", "Có hóa đơn", "Tài khoản công ty"]);
  });

  await check("E2E-C3b", "Khoản chi sau chọn lại nhãn người chi vừa nhập", async (shot) => {
    await go("/expenses");
    const picker = page.locator("select").filter({ has: page.locator('option[value="__new__"]') });
    await picker.selectOption(EXPENSE_PAYER);
    await page.locator('input[name="spentOn"]').fill(todayVN());
    await page.locator('select[name="category"]').selectOption("reception");
    await page.locator('input[name="amount"]').fill("80000");
    await page.locator('select[name="hasInvoice"]').selectOption("no");
    await page.locator('select[name="fundedBy"]').selectOption("personal");
    await page.locator('input[name="note"]').fill(`${EXPENSE_NOTE} 2`);
    await Promise.all([
      page.waitForURL(/[?&]ok=1/, { timeout: 25000 }),
      page.getByRole("button", { name: "Lưu khoản chi" }).click(),
    ]);
    await ready();
    await must(shot, ["Đã lưu khoản chi", `${EXPENSE_NOTE} 2`, EXPENSE_PAYER, "80.000₫", "Không hóa đơn", "Tài khoản cá nhân"]);
  });

  await check("E2E-C4", "Nhật ký ghi thêm khoản chi", async (shot) => {
    await go("/audit?entity=expense&action=create");
    await page.locator("details summary").first().click();
    await ready();
    await must(shot, ["Nhật ký thao tác", "Chi phí", "Thêm mới", EXPENSE_NOTE]);
  });

  await check("E2E-C5", "Quản lý xóa khoản chi vừa nhập", async (shot) => {
    await go("/expenses");
    for (let i = 0; i < 4; i += 1) {
      const row = page.locator("div.rounded-xl").filter({ hasText: EXPENSE_NOTE });
      if (!(await row.count())) break;
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/expenses"), { timeout: 25000 }),
        row.first().getByRole("button", { name: "Xóa" }).click(),
      ]);
      await ready();
    }
    const text = await must(shot, ["Chi phí", "Nhập chi phí"]);
    if (text.includes(EXPENSE_NOTE)) throw new Error("Khoản chi vẫn còn sau khi xóa");
  });

  await check("E2E-C6", "Nhật ký ghi xóa khoản chi", async (shot) => {
    await go("/audit?entity=expense&action=delete");
    await page.locator("details summary").first().click();
    await ready();
    await must(shot, ["Nhật ký thao tác", "Chi phí", "Xóa", EXPENSE_NOTE]);
  });

  await check("E2E-O3", "Chủ sở hữu thấy doanh thu OTA", async (shot) => {
    await logout();
    await login("chusohuu");
    await go("/owner");
    await must(shot, ["OTA sau hoa hồng", "Công nợ đối tác", "phải trả hoa hồng", "E2E OTA"]);
  });

  await check("E2E-C7", "Chủ sở hữu không vào chi phí", async (shot) => {
    await assertNoExpenses(shot);
  });

  await check("E2E-R17", "Quản lý hủy booking E2E còn giữ chỗ để trả phòng", async (shot) => {
    await logout();
    await login("quanly");
    for (const name of ["E2E OTA Tai KS", "E2E OTA Phu Thu", "E2E Phu Thu", "E2E OTA"]) {
      await cancelOpenBooking(name);
    }
    await go(`/sales/bookings?q=${encodeURIComponent("E2E OTA")}`);
    await must(shot, ["Đặt phòng"]);
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
  room: bookedRoom,
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
