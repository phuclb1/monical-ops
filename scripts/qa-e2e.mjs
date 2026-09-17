import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.OPS_URL || "http://localhost:3002";
const GUEST = "E2E Van A";
const ROOM = "101";
const HK_TASK = `E2E dọn P.${ROOM}`;

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
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await ready();
}

async function login(username) {
  await go("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill("123456");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
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
    await login("tuyen");
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
    const box101 = page.locator('label').filter({ hasText: `P.${ROOM}` }).locator('input[name="roomId"]');
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

  await check("E2E-R5", "Task nhận P.101 + tick checklist", async (shot) => {
    await go("/tasks");
    await page.getByRole("link").filter({ hasText: `Nhận P.${ROOM}` }).filter({ hasText: GUEST }).first().click();
    await page.waitForURL(/\/tasks\/[a-f0-9-]+/i, { timeout: 20000 });
    await page.getByText("Phòng INS").waitFor({ timeout: 20000 });
    await ready();
    await page.locator("button.hit-check").first().click();
    await ready();
    await must(shot, [`Nhận P.${ROOM}`, GUEST, "Phòng INS", "Check-in PMS"]);
  });

  await check("E2E-R6", "Nhận phòng trên booking", async (shot) => {
    await go("/sales/bookings");
    await page.getByRole("link").filter({ hasText: GUEST }).first().click();
    await ready();
    await page.getByRole("button", { name: "Nhận" }).click();
    await ready();
    await must(shot, [GUEST, "Đang ở"]);
  });

  await check("E2E-R8", "Lễ tân giao việc dọn HK", async (shot) => {
    await go("/tasks/new");
    await page.locator('select[name="kind"]').selectOption("housekeeping");
    await page.locator('select[name="roomId"]').selectOption({ label: `P.${ROOM}` });
    const assignee = page.locator('select[name="assigneeId"]');
    if (await assignee.count()) {
      const uy = await assignee.locator("option", { hasText: "Uyên" }).getAttribute("value");
      if (uy) await assignee.selectOption(uy);
    }
    await page.locator('textarea[name="content"]').fill(HK_TASK);
    await Promise.all([
      page.waitForURL(/\/tasks\/(?!new)/, { timeout: 25000 }),
      page.getByRole("button", { name: "Tạo việc" }).click(),
    ]);
    await ready();
    await must(shot, [HK_TASK, "Dọn phòng khách ở"]);
  });

  await check("E2E-R9", "Filter Phòng bẩn có P.101", async (shot) => {
    await go("/rooms?focus=dirty");
    await must(shot, ["Phòng bẩn", `P.${ROOM}`]);
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

  await check("E2E-H1", "HK login — không vào bán phòng", async (shot) => {
    await logout();
    await login("uyen");
    await go("/sales");
    await ready();
    if (page.url().includes("/sales")) throw new Error("HK vẫn vào được /sales");
    await must(shot, ["Thêm"]);
  });

  await check("E2E-H3", "HK thấy việc lễ tân giao", async (shot) => {
    await go("/tasks");
    await must(shot, [HK_TASK, "Dọn phòng khách ở"]);
  });

  await check("E2E-H4", "HK Mới → Đang xử lý → Hoàn tất", async (shot) => {
    await go("/tasks");
    await page.getByRole("link").filter({ hasText: HK_TASK }).first().click();
    await ready();
    await page.locator('select[name="status"]').selectOption("in_progress");
    await page.getByRole("button", { name: "Lưu trạng thái" }).click();
    await ready();
    await page.locator('select[name="status"]').selectOption("done");
    await page.getByRole("button", { name: "Lưu trạng thái" }).click();
    await ready();
    await must(shot, [HK_TASK, "Hoàn tất"]);
  });

  await check("E2E-H5", "HK chuyển status phòng nếu được", async (shot) => {
    await go(`/rooms/r-${ROOM}`);
    const next = page.getByRole("button", { name: /Chuyển →/ });
    if (await next.count()) {
      await next.click();
      await ready();
    }
    await must(shot, [`P.${ROOM}`]);
  });

  await check("E2E-H6", "Phòng bẩn không còn khách E2E", async (shot) => {
    await go("/rooms?focus=dirty");
    const text = await must(shot, ["Phòng bẩn"]);
    if (text.includes(GUEST)) throw new Error("Filter bẩn vẫn còn khách E2E sau khi việc xong");
  });

  await check("E2E-X1", "Lễ tân hủy booking E2E (không trả cùng ngày nhận)", async (shot) => {
    await logout();
    await login("tuyen");
    await go("/sales/bookings");
    await page.getByRole("link").filter({ hasText: GUEST }).first().click();
    await ready();
    await page.getByRole("button", { name: "Hủy booking" }).click();
    await ready();
    await must(shot, [GUEST, "Hủy"]);
  });

  await check("E2E-X3", "Sơ đồ ngày không còn booking E2E", async (shot) => {
    await go("/sales");
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes(GUEST)) throw new Error("Sơ đồ vẫn còn khách E2E sau khi hủy");
  });

  await check("E2E-R11", "Bàn giao còn trang gom việc", async (shot) => {
    await go("/handover");
    await must(shot, ["Bàn giao"]);
  });

  await check("E2E-R10", "Cuối ca hiện trên ca đang mở", async (shot) => {
    await go("/shifts");
    await must(shot, ["Cuối ca", "Đang mở"]);
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
