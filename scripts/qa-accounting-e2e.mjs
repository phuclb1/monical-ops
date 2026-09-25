import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.OPS_URL || "http://localhost:3002").replace(/\/$/, "");
const managerUser = process.env.OPS_MANAGER_USER || "quanly";
const managerPassword = process.env.OPS_PASSWORD || "123456";
const runStamp = Date.now();
const testUser = `qa.accounting.${String(runStamp).slice(-8)}`;
const testEmail = `${testUser}@example.com`;
const testPassword = "Qa.Account1!";

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `ACCOUNTING-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const managerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const accountingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const managerPage = await managerContext.newPage();
const accountingPage = await accountingContext.newPage();
const results = [];
let accountPath = "";
const made = { direct: "", ota: "", plain: "" };

async function ready(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function go(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await ready(page);
}

async function login(page, username, password) {
  await go(page, "/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await ready(page);
}

async function pageText(page) {
  const body = await page.locator("body").innerText();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].map((element) => element.value || "").join("\n"),
  );
  return `${body}\n${values}`.replace(/[\u00a0\u202f]/g, " ");
}

function fold(value) {
  return String(value).toLocaleLowerCase("vi");
}

async function must(page, shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const body = await pageText(page);
  const missing = needles.filter((needle) => !fold(body).includes(fold(needle)));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
}

async function pickOpenRoom(page) {
  const boxes = page.locator('input[name="roomId"][type="checkbox"]');
  const n = await boxes.count();
  if (!n) throw new Error("Không còn phòng trống");
  const box = boxes.first();
  await box.scrollIntoViewIfNeeded();
  if (!(await box.isChecked())) await box.check();
  for (let i = 1; i < n; i += 1) {
    const item = boxes.nth(i);
    if (await item.isChecked()) await item.uncheck();
  }
  return String((await box.getAttribute("value")) || "").replace(/^r-/, "");
}

async function createCheckedInBooking(page, { guest, phone, source, invoice }) {
  await go(page, "/sales/new");
  if (source) await page.locator('select[name="source"]').selectOption(source);
  const room = await pickOpenRoom(page);
  await page.locator('input[name="guestName"]').fill(guest);
  await page.locator('input[name="guestPhone"]').fill(phone);
  const invoiceBox = page.locator('input[name="invoiceRequested"]');
  if (invoice) await invoiceBox.check();
  else if (await invoiceBox.isChecked()) await invoiceBox.uncheck();
  const now = page.locator('input[name="checkinNow"]');
  if (await now.count() && !(await now.isChecked())) await now.check();
  await Promise.all([
    page.waitForURL(/\/sales\/bookings\//, { timeout: 30_000 }),
    page.getByRole("button", { name: /Lưu/ }).click(),
  ]);
  await ready(page);
  const text = await pageText(page);
  const code = text.match(/Mã Ops\s+(BK-\d{2}-\d+)/)?.[1];
  if (!code) throw new Error(`Không thấy mã Ops của ${guest}`);
  if (!text.includes("Đang ở")) throw new Error(`${guest} chưa ở trạng thái đang ở`);
  return { room, code };
}

async function cardText(page, heading) {
  const card = page.locator("section.card").filter({ has: page.getByRole("heading", { name: heading }) });
  await card.first().waitFor({ timeout: 15_000 });
  return card.first().innerText();
}

async function check(id, title, page, fn) {
  const row = { id, title, result: "fail", evidence: "", note: "" };
  const shot = join(outDir, `${id}.png`);
  try {
    await fn(shot);
    row.result = "pass";
  } catch (error) {
    row.note = String(error?.message || error).slice(0, 300);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`FAIL ${id}`, row.note);
  }
  row.evidence = `qa/evidence/${runId}/${id}.png`;
  results.push(row);
  console.log(`${row.result.toUpperCase()} ${id}  ${title}`);
}

try {
  await login(managerPage, managerUser, managerPassword);

  await check("AC-01", "Quản lý tạo tài khoản kế toán", managerPage, async (shot) => {
    await go(managerPage, "/staff");
    await managerPage.locator('input[name="fullName"]').fill("QA Accounting Account");
    await managerPage.locator('input[name="username"]').fill(testUser);
    await managerPage.locator('input[name="email"]').fill(testEmail);
    await managerPage.locator('input[name="password"]').fill(testPassword);
    await managerPage.locator('select[name="role"]').selectOption("accounting");
    await managerPage.getByRole("button", { name: "Tạo nhân viên" }).click();
    await managerPage.waitForURL(/\/staff\/[^/]+$/, { timeout: 30_000 });
    accountPath = new URL(managerPage.url()).pathname;
    await must(managerPage, shot, ["QA Accounting Account", "Kế toán", testEmail]);
  });

  await check("AC-02", "Kế toán đăng nhập thẳng vào view riêng", accountingPage, async (shot) => {
    await login(accountingPage, testUser, testPassword);
    if (new URL(accountingPage.url()).pathname !== "/accounting") {
      throw new Error(`Sai trang mặc định: ${accountingPage.url()}`);
    }
    await must(accountingPage, shot, [
      "Kế toán",
      "Doanh thu ghi nhận có xuất hóa đơn",
      "Trực tiếp yêu cầu xuất",
      "OTA 100%",
      "100% tiền phòng OTA",
      "Booking nhận trong kỳ",
      "CK công ty",
      "CK cá nhân",
      "Tiền mặt",
      "Sơ đồ phòng",
    ]);
  });

  await check("AC-07", "Quản lý tạo booking đã nhận: trực tiếp có xuất, OTA, trực tiếp không xuất", managerPage, async (shot) => {
    const direct = await createCheckedInBooking(managerPage, {
      guest: "QA Xuat Hoa Don",
      phone: "0901000701",
      invoice: true,
    });
    const ota = await createCheckedInBooking(managerPage, {
      guest: "QA Ota Day Du",
      phone: "0901000702",
      source: "agoda",
      invoice: false,
    });
    const plain = await createCheckedInBooking(managerPage, {
      guest: "QA Khong Xuat",
      phone: "0901000703",
      invoice: false,
    });
    made.direct = direct.code;
    made.ota = ota.code;
    made.plain = plain.code;
    await must(managerPage, shot, [plain.code, "Đang ở", "Không xuất hóa đơn"]);
  });

  await check("AC-08", "Báo cáo xuất hóa đơn gồm trực tiếp có yêu cầu và 100% OTA", accountingPage, async (shot) => {
    if (!made.direct || !made.ota || !made.plain) throw new Error("Chưa có booking để đối chiếu");
    await go(accountingPage, "/accounting");
    const invoice = await cardText(accountingPage, /Doanh thu xuất hóa đơn/);
    const booked = await cardText(accountingPage, /Booking nhận trong kỳ/);
    const rowOf = (text, code) => {
      const row = text
        .split("Booking ")
        .slice(1)
        .find((part) => part.startsWith(code) && !/^\d/.test(part.slice(code.length)));
      if (!row) throw new Error(`Thiếu ${code}`);
      return row;
    };
    const directRow = rowOf(invoice, made.direct);
    const otaRow = rowOf(invoice, made.ota);
    if (!directRow.includes("Trực tiếp · yêu cầu xuất")) throw new Error(`${made.direct} không gắn nhãn trực tiếp yêu cầu xuất`);
    if (!otaRow.includes("OTA · 100% tiền phòng")) throw new Error(`${made.ota} không gắn nhãn OTA 100%`);
    if (invoice.includes(made.plain)) throw new Error(`${made.plain} không yêu cầu xuất nhưng vẫn vào doanh thu hóa đơn`);
    const plainRow = rowOf(booked, made.plain);
    if (!plainRow.includes("Không xuất")) throw new Error(`${made.plain} không còn trong danh sách nhận trong kỳ`);
    rowOf(booked, made.ota);
    await accountingPage.screenshot({ path: shot, fullPage: true });
  });

  await check("AC-03", "View kế toán không có PII hoặc liên kết vận hành", accountingPage, async (shot) => {
    await go(accountingPage, "/accounting");
    const body = await pageText(accountingPage);
    const forbiddenText = ["SĐT", "Ghi chú khách", "Tạo booking", "Nhân viên", "Nhật ký thao tác"];
    const foundText = forbiddenText.filter((value) => body.includes(value));
    if (foundText.length) throw new Error(`Lộ nội dung không được phép: ${foundText.join(" | ")}`);

    const hrefs = await accountingPage.locator("a[href]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") || ""),
    );
    const forbiddenHref = hrefs.find((href) => {
      const path = href.split("?")[0];
      if (path === "/sales") return false;
      return (
        path.startsWith("/sales/") ||
        path.startsWith("/reception") ||
        path.startsWith("/tasks") ||
        path.startsWith("/rooms") ||
        path.startsWith("/staff") ||
        path.startsWith("/reports")
      );
    });
    if (forbiddenHref) throw new Error(`Có liên kết vận hành: ${forbiddenHref}`);
    if (!hrefs.some((href) => href.split("?")[0] === "/sales")) throw new Error("Thiếu liên kết sơ đồ phòng");
    await accountingPage.screenshot({ path: shot, fullPage: true });
  });

  await check("AC-04", "Kế toán bị chặn khỏi mọi URL vận hành", accountingPage, async (shot) => {
    const blocked = ["/today", "/tasks", "/rooms", "/handover", "/reports", "/sales/bookings", "/sales/new", "/staff", "/notifications"];
    for (const path of blocked) {
      await go(accountingPage, path);
      if (new URL(accountingPage.url()).pathname !== "/accounting") {
        throw new Error(`${path} không chuyển về /accounting: ${accountingPage.url()}`);
      }
    }
    await must(accountingPage, shot, ["Kế toán", "Booking nhận trong kỳ"]);
  });

  await check("AC-05", "Sơ đồ phòng của kế toán chỉ xem, che tên, không bán", accountingPage, async (shot) => {
    await go(accountingPage, "/sales");
    if (new URL(accountingPage.url()).pathname !== "/sales") {
      throw new Error(`Không mở được sơ đồ phòng: ${accountingPage.url()}`);
    }
    await must(accountingPage, shot, ["Sơ đồ phòng", "Chỉ xem lịch phòng", "QA D***"]);
    const text = await pageText(accountingPage);
    const leaked = ["QA Xuat Hoa Don", "Bán phòng", "Kéo tên khách", "Đặt phòng"].filter((value) => text.includes(value));
    if (leaked.length) throw new Error(`Sơ đồ phòng lộ thao tác hoặc tên khách: ${leaked.join(" | ")}`);
    const sellLinks = await accountingPage.locator('a[href*="/sales/new"], a[href*="/sales/bookings"]').count();
    if (sellLinks) throw new Error("Sơ đồ phòng vẫn dẫn tới bán phòng hoặc sửa booking");
  });

  await check("AC-09", "Kế toán đổi mật khẩu", accountingPage, async (shot) => {
    await go(accountingPage, "/account/password");
    await must(accountingPage, shot, ["Đổi mật khẩu", "Mật khẩu hiện tại", "Mật khẩu mới"]);
    const backHref = await accountingPage.getByRole("link", { name: "← Quay lại" }).getAttribute("href");
    if (backHref !== "/accounting") throw new Error(`Link quay lại sai: ${backHref}`);
  });

  await check("AC-06", "Role khác không vào được view kế toán", managerPage, async (shot) => {
    await go(managerPage, "/accounting");
    if (new URL(managerPage.url()).pathname !== "/") {
      throw new Error(`Quản lý vẫn vào /accounting: ${managerPage.url()}`);
    }
    await must(managerPage, shot, ["Dashboard"]);
  });
} finally {
  if (accountPath) {
    await go(managerPage, accountPath).catch(() => {});
    const lockButton = managerPage.getByRole("button", { name: "Khóa tài khoản" });
    if (await lockButton.count()) {
      await lockButton.click().catch(() => {});
      await ready(managerPage).catch(() => {});
    }
  }
  await browser.close();
}

const pass = results.filter((result) => result.result === "pass").length;
const fail = results.length - pass;
const rate = results.length ? Math.round((pass / results.length) * 100) : 0;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit,
  env: base,
  testUser,
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
