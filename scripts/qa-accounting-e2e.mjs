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
      "Booking nhận trong kỳ",
      "CK công ty",
      "CK cá nhân",
      "Tiền mặt",
    ]);
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
    const forbiddenHref = hrefs.find(
      (href) =>
        href.startsWith("/sales") ||
        href.startsWith("/reception") ||
        href.startsWith("/tasks") ||
        href.startsWith("/rooms") ||
        href.startsWith("/staff") ||
        href.startsWith("/reports"),
    );
    if (forbiddenHref) throw new Error(`Có liên kết vận hành: ${forbiddenHref}`);
    await accountingPage.screenshot({ path: shot, fullPage: true });
  });

  await check("AC-04", "Kế toán bị chặn khỏi mọi URL vận hành", accountingPage, async (shot) => {
    const blocked = ["/today", "/tasks", "/rooms", "/handover", "/reports", "/sales/bookings", "/staff", "/notifications"];
    for (const path of blocked) {
      await go(accountingPage, path);
      if (new URL(accountingPage.url()).pathname !== "/accounting") {
        throw new Error(`${path} không chuyển về /accounting: ${accountingPage.url()}`);
      }
    }
    await must(accountingPage, shot, ["Kế toán", "Booking nhận trong kỳ"]);
  });

  await check("AC-05", "Kế toán chỉ được mở thêm trang đổi mật khẩu", accountingPage, async (shot) => {
    await go(accountingPage, "/account/password");
    await must(accountingPage, shot, ["Đổi mật khẩu", "Mật khẩu hiện tại", "Mật khẩu mới"]);
    const backHref = await accountingPage.getByRole("link", { name: "← Quay lại" }).getAttribute("href");
    if (backHref !== "/accounting") throw new Error(`Link quay lại sai: ${backHref}`);
  });

  await check("AC-06", "Role khác không vào được view kế toán", managerPage, async (shot) => {
    await go(managerPage, "/accounting");
    if (new URL(managerPage.url()).pathname !== "/sales/bookings") {
      throw new Error(`Quản lý vẫn vào /accounting: ${managerPage.url()}`);
    }
    await must(managerPage, shot, ["Đặt phòng"]);
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
