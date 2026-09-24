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
const testUser = `qa.password.${String(runStamp).slice(-8)}`;
const testEmail = process.env.OPS_PASSWORD_TEST_EMAIL || `${testUser}@example.com`;
const initialPassword = "Qa.Start1!";
const changedPassword = "Qa.Change2@";
const resetPassword = "Qa.Reset3#";

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `PASSWORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const managerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const userContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const managerPage = await managerContext.newPage();
const userPage = await userContext.newPage();
const publicPage = await publicContext.newPage();
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

async function login(page, username, password, expectSuccess = true) {
  await go(page, "/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  if (expectSuccess) {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  } else {
    await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.has("error"), { timeout: 30_000 });
  }
  await ready(page);
}

async function text(page) {
  const body = await page.locator("body").innerText();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].map((element) => element.value || "").join("\n"),
  );
  return `${body}\n${values}`.replace(/[\u00a0\u202f]/g, " ");
}

async function must(page, shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const body = await text(page);
  const missing = needles.filter((needle) => !body.includes(needle));
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

async function fillCreateAccount(password) {
  await go(managerPage, "/staff");
  await managerPage.locator('input[name="fullName"]').fill("QA Password Account");
  await managerPage.locator('input[name="username"]').fill(testUser);
  await managerPage.locator('input[name="email"]').fill(testEmail);
  await managerPage.locator('input[name="password"]').fill(password);
  await managerPage.locator('select[name="role"]').selectOption("reception");
  await managerPage.locator('input[name="phone"]').fill("0900000999");
  await managerPage.getByRole("button", { name: "Tạo nhân viên" }).click();
  await ready(managerPage);
}

try {
  await check("PW-01", "Trang quên mật khẩu và token sai là public", publicPage, async (shot) => {
    await go(publicPage, "/forgot-password");
    await must(publicPage, shot, ["Tìm lại mật khẩu", "Gửi liên kết khôi phục"]);
    await go(publicPage, "/reset-password?token=invalid");
    await must(publicPage, shot, ["Liên kết không hợp lệ hoặc đã hết hạn"]);
  });

  await login(managerPage, managerUser, managerPassword);

  await check("PW-02", "Quản lý không thể tạo mật khẩu thiếu chữ hoa", managerPage, async (shot) => {
    await fillCreateAccount("qa.weak1!");
    await managerPage.waitForURL((url) => url.pathname === "/staff" && url.searchParams.has("error"), { timeout: 30_000 });
    await must(managerPage, shot, ["Ít nhất 8 ký tự", "chữ in hoa", "ký tự đặc biệt"]);
  });

  await check("PW-03", "Quản lý tạo tài khoản với mật khẩu mạnh", managerPage, async (shot) => {
    await fillCreateAccount(initialPassword);
    await managerPage.waitForURL(/\/staff\/[^/]+$/, { timeout: 30_000 });
    accountPath = new URL(managerPage.url()).pathname;
    await must(managerPage, shot, ["QA Password Account", testUser, testEmail, "Đặt lại mật khẩu"]);
  });

  await check("PW-04", "Người dùng không thể đổi sang mật khẩu yếu", userPage, async (shot) => {
    await login(userPage, testUser, initialPassword);
    await go(userPage, "/account/password");
    await userPage.locator('input[name="currentPassword"]').fill(initialPassword);
    await userPage.locator('input[name="newPassword"]').fill("qa.weak1!");
    await userPage.locator('input[name="confirmation"]').fill("qa.weak1!");
    await userPage.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await userPage.waitForURL((url) => url.pathname === "/account/password" && url.searchParams.has("error"), {
      timeout: 30_000,
    });
    await must(userPage, shot, ["Ít nhất 8 ký tự", "chữ in hoa", "ký tự đặc biệt"]);
  });

  await check("PW-05", "Đổi mật khẩu thành công; mật khẩu cũ bị từ chối", userPage, async (shot) => {
    await go(userPage, "/account/password");
    await userPage.locator('input[name="currentPassword"]').fill(initialPassword);
    await userPage.locator('input[name="newPassword"]').fill(changedPassword);
    await userPage.locator('input[name="confirmation"]').fill(changedPassword);
    await userPage.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await userPage.waitForURL(/\/account\/password\?ok=1/, { timeout: 30_000 });
    await must(userPage, shot, ["Đã đổi mật khẩu", "đăng xuất các phiên khác"]);
    await userContext.clearCookies();
    await login(userPage, testUser, initialPassword, false);
    await must(userPage, shot, ["Sai tài khoản hoặc mật khẩu"]);
    await login(userPage, testUser, changedPassword);
  });

  await check("PW-06", "Quản lý reset mật khẩu người khác và vô hiệu hóa phiên cũ", managerPage, async (shot) => {
    if (!accountPath) throw new Error("Không có đường dẫn tài khoản test");
    await go(managerPage, accountPath);
    await managerPage.locator('input[name="password"]').fill(resetPassword);
    await managerPage.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    await managerPage.waitForURL((url) => url.pathname === accountPath && url.searchParams.get("ok") === "pw", {
      timeout: 30_000,
    });
    await must(managerPage, shot, ["Đã đặt lại mật khẩu"]);
    await go(userPage, "/today");
    await userPage.waitForURL(/\/login/, { timeout: 30_000 });
    await must(userPage, shot, ["Đăng nhập"]);
  });

  await check("PW-07", "Đăng nhập được bằng mật khẩu quản lý vừa reset", userPage, async (shot) => {
    await login(userPage, testUser, changedPassword, false);
    await must(userPage, shot, ["Sai tài khoản hoặc mật khẩu"]);
    await login(userPage, testUser, resetPassword);
    await must(userPage, shot, ["QA Password Account"]);
  });

  await check("PW-08", "Yêu cầu email không làm lộ tài khoản tồn tại", publicPage, async (shot) => {
    await go(publicPage, "/forgot-password");
    await publicPage.locator('input[name="email"]').fill(testEmail);
    await publicPage.getByRole("button", { name: "Gửi liên kết khôi phục" }).click();
    await publicPage.waitForURL(/\/forgot-password\?sent=1/, { timeout: 30_000 });
    const knownMessage = await text(publicPage);
    await go(publicPage, "/forgot-password");
    await publicPage.locator('input[name="email"]').fill(`unknown.${runStamp}@example.com`);
    await publicPage.getByRole("button", { name: "Gửi liên kết khôi phục" }).click();
    await publicPage.waitForURL(/\/forgot-password\?sent=1/, { timeout: 30_000 });
    const unknownMessage = await text(publicPage);
    if (knownMessage !== unknownMessage) throw new Error("Phản hồi email tồn tại và không tồn tại khác nhau");
    await must(publicPage, shot, ["Nếu email đã được đăng ký", "hết hạn sau 30 phút"]);
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
  emailDeliveryChecked: false,
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
