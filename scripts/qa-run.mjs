import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.OPS_URL || "http://localhost:3002";

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `R-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

function currentShiftLabel() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (hour >= 6 && hour < 14) return "Ca sáng";
  if (hour >= 14 && hour < 22) return "Ca chiều";
  return "Ca đêm";
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const results = [];

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(350);
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

async function check(id, title, fn) {
  const row = { id, title, result: "fail", evidence: "", note: "" };
  try {
    const shot = join(outDir, `${id}.png`);
    await fn(shot);
    row.result = "pass";
    row.evidence = `qa/evidence/${runId}/${id}.png`;
  } catch (error) {
    row.note = String(error.message || error).slice(0, 240);
    const shot = join(outDir, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    row.evidence = `qa/evidence/${runId}/${id}.png`;
    row.result = "fail";
    console.error(`FAIL ${id}`, row.note);
  }
  results.push(row);
  console.log(`${row.result.toUpperCase()} ${id}  ${title}`);
}

async function pageText() {
  const body = await page.locator("body").innerText();
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")].map((el) => el.value || "").join("\n"),
  );
  return `${body}\n${values}`;
}

async function must(shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const text = await pageText();
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
}

try {
  await check("TC-01", "Màn đăng nhập", async (shot) => {
    await go("/login");
    await must(shot, ["Đăng nhập", "Tài khoản"]);
  });

  await check("TC-02", "Login sai mật khẩu", async (shot) => {
    await go("/login");
    await page.locator('input[name="username"]').fill("quanly");
    await page.locator('input[name="password"]').fill("sai-mat-khau");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await ready();
    await must(shot, ["Sai tài khoản hoặc mật khẩu"]);
  });

  await check("TC-03", "Lễ tân đăng nhập — Today ca đang mở", async (shot) => {
    await login("tuyen");
    await must(shot, ["Ca đang làm", currentShiftLabel(), "Đầu ca"]);
  });

  await check("TC-10", "Khách đang check-in (đến)", async (shot) => {
    await go("/reception?tab=arriving");
    await must(shot, ["Nguyễn Thu Hà", "Khách đến"]);
  });

  await check("TC-11", "Khách đang ở", async (shot) => {
    await go("/reception?tab=inhouse");
    await must(shot, ["Trần Minh Khoa", "Lê Thị Hạnh"]);
  });

  await check("TC-12", "Khách checkout", async (shot) => {
    await go("/reception?tab=departing");
    await must(shot, ["Phạm Đức Anh"]);
  });

  await check("TC-13", "Thẻ khách check-in P.105", async (shot) => {
    await go("/reception/s-201");
    await must(shot, ["Nguyễn Thu Hà", "Đang check-in", "Đã nhập booking", "Phòng INS"]);
  });

  await check("TC-14", "Khách gửi ô tô + timer đăng ký", async (shot) => {
    await go("/reception/s-305");
    await must(shot, ["Trần Minh Khoa", "51H-223.18", "Hầm B1-12"]);
  });

  await check("TC-15", "Khách đi — thiếu hóa đơn + dọn phòng trả", async (shot) => {
    await go("/reception/s-102");
    await must(shot, ["Phạm Đức Anh", "Checkout 12:00", "Hóa đơn"]);
  });

  await check("TC-90", "PMS khách đến — booking xong, chưa check-in", async (shot) => {
    await go("/reception/s-201");
    await must(shot, ["Đối chiếu ezCloudhotel PMS", "EZ-88502", "Đã nhập booking — đã xác nhận", "Xác nhận Đã check-in PMS"]);
  });

  await check("TC-16", "Bấm xác nhận check-in PMS → bắt đầu 30 phút", async (shot) => {
    await go("/reception/s-201");
    await page.getByRole("button", { name: /Xác nhận Đã check-in PMS/ }).click();
    await ready();
    await must(shot, ["Đã check-in PMS (bắt đầu 30 phút) — đã xác nhận"]);
  });

  await check("TC-91", "PMS khách đang ở — đã check-in PMS", async (shot) => {
    await go("/reception/s-305");
    await must(shot, ["Đối chiếu ezCloudhotel PMS", "EZ-88421", "Đã check-in PMS (bắt đầu 30 phút) — đã xác nhận"]);
  });

  await check("TC-92", "PMS khách đi — chưa checkout / hóa đơn", async (shot) => {
    await go("/reception/s-102");
    await must(shot, ["EZ-88201", "Xác nhận Đã check-out PMS", "Xác nhận Đã xuất hóa đơn"]);
  });

  await check("TC-20", "Bảng việc: thay khăn / dọn phòng / checkout", async (shot) => {
    await go("/tasks");
    await must(shot, ["Thay 2 khăn tắm P.305", "Dọn phòng khách ở P.202", "Dọn phòng trả P.102", "Nhận P.105", "Trả P.102"]);
  });

  await check("TC-21", "Quản lý yêu cầu thêm HK (lễ tân thấy việc)", async (shot) => {
    await go("/tasks");
    await must(shot, ["Cần thêm HK ca này"]);
  });

  await check("TC-22", "Tạo việc — loại lễ tân", async (shot) => {
    await go("/tasks/new");
    await must(shot, ["Thay khăn", "Dọn phòng khách ở"]);
  });

  await check("TC-30", "Báo ăn sáng ngày mai", async (shot) => {
    await go("/kitchen");
    await must(shot, ["dị ứng hải sản", "Người lớn"]);
  });

  await check("TC-40", "Danh sách phòng", async (shot) => {
    await go("/rooms");
    await must(shot, ["305", "102", "Sẽ đến", "Phòng bẩn"]);
  });

  await check("TC-93", "Sơ đồ bán phòng lễ tân", async (shot) => {
    await go("/sales");
    await must(shot, ["Bán phòng", "Trống", "Đang ở", "Sẽ đến", "Phòng bẩn", "Đặt phòng"]);
  });

  await check("TC-100", "Lọc nguồn Ops / ezCloud", async (shot) => {
    await go("/sales");
    await must(shot, ["Ops", "ezCloud"]);
  });

  await check("TC-94", "Chỗ bán seed P.401 / P.506", async (shot) => {
    await go("/sales");
    await must(shot, ["Đặng Minh Tuấn", "Công ty An Phú"]);
  });

  await check("TC-101", "Danh sách đặt phòng / booking", async (shot) => {
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Đang mở", "Đặng Minh Tuấn", "Công ty An Phú"]);
  });

  await check("TC-95", "Form bán phòng: giá, chiết khấu, mã PMS", async (shot) => {
    await go("/sales/new");
    await must(shot, ["Giá / đêm", "Chiết khấu", "Mã PMS"]);
  });

  await check("TC-99", "Form bán: nền tảng Booking / Agoda / Ops", async (shot) => {
    await go("/sales/new");
    await must(shot, ["Nền tảng", "Booking.com", "Agoda", "Từ ezCloud"]);
  });

  await check("TC-96", "Lễ tân không sửa giá phòng", async (shot) => {
    await go("/sales/rates");
    await ready();
    if (page.url().includes("/sales/rates")) throw new Error("Lễ tân vẫn vào được /sales/rates");
    await page.screenshot({ path: shot, fullPage: true });
    const text = await pageText();
    if (text.includes("Lưu giá") && page.url().includes("/sales/rates")) {
      throw new Error("Lễ tân thấy form lưu giá");
    }
  });

  await check("TC-50", "Bàn giao gom việc / xe", async (shot) => {
    await go("/handover");
    await must(shot, ["Bàn giao"]);
  });

  await check("TC-70", "Checklist ca lễ tân", async (shot) => {
    await go("/shifts");
    await must(shot, [currentShiftLabel(), "Đang mở", "Đầu ca", "Cuối ca"]);
  });

  await check("TC-64b", "Lễ tân không vào nhật ký", async (shot) => {
    await go("/audit");
    await ready();
    const text = await page.locator("body").innerText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes("Chỉ quản lý") && text.includes("Người làm")) {
      throw new Error("Lễ tân vẫn xem được nhật ký");
    }
  });

  await check("TC-72", "Today — task nhận/trả theo phòng", async (shot) => {
    await go("/today");
    await must(shot, ["Nhận P.105", "Trả P.102", "Nhận / trả hôm nay"]);
  });

  await check("TC-73", "Bảng việc — nhận P.105 / trả P.102 / nhận P.506", async (shot) => {
    await go("/tasks");
    await must(shot, ["Nhận P.105", "Trả P.102", "Nhận P.506"]);
  });

  await check("TC-74", "Task nhận P.105 có checklist", async (shot) => {
    await go("/tasks");
    await page.getByRole("link", { name: /Nhận P\.105/ }).first().click();
    await page.getByText("Phòng INS").waitFor({ timeout: 15000 });
    await ready();
    await must(shot, ["Phòng INS", "Check-in PMS", "Đưa chìa", "Ảnh tuỳ chọn"]);
  });

  await check("TC-75", "Thẻ khách P.105 cùng checklist nhận", async (shot) => {
    await go("/reception/s-201");
    await must(shot, ["Phòng INS / sẵn sàng", "Check-in PMS", "Đưa chìa / thẻ phòng"]);
  });

  await check("TC-76", "Chỗ bán P.506 có checklist nhận phòng", async (shot) => {
    await go("/sales/sale-506");
    await must(shot, ["Công ty An Phú", "Nhận phòng P.506"]);
  });

  await logout();

  await check("TC-04", "Quản lý Today — không bắt mở ca", async (shot) => {
    await login("quanly");
    const text = await page.locator("body").innerText();
    if (text.includes("Mở ca hiện tại") && !text.includes("Ca đang làm")) {
      throw new Error("Quản lý vẫn bị màn bắt mở ca");
    }
    await page.screenshot({ path: shot, fullPage: true });
    if (!text.includes("Ca đang làm") && !text.includes("Ca lễ tân chưa mở")) {
      throw new Error("Today quản lý không ra trạng thái ca");
    }
  });

  await check("TC-21b", "Quản lý thấy việc thêm HK do mình tạo", async (shot) => {
    await go("/tasks");
    await must(shot, ["Cần thêm HK ca này", "hỗ trợ dồn dọn tầng 2"]);
  });

  await check("TC-23", "Tạo việc — loại quản lý", async (shot) => {
    await go("/tasks/new");
    await must(shot, ["Theo dõi việc trễ"]);
  });

  await check("TC-60", "Staff: 3 lễ tân + 1 HK", async (shot) => {
    await go("/staff");
    await must(shot, ["Ngân Lễ tân", "Thu Lễ tân", "Tuyến Lễ tân", "Uyên HK"]);
  });

  await check("TC-61", "Lịch lễ tân tuần", async (shot) => {
    await go("/roster");
    await must(shot, ["Ngân", "Thu", "Tuyến"]);
  });

  await check("TC-41", "Quản lý hạng phòng", async (shot) => {
    await go("/rooms/manage");
    await must(shot, ["Hạng phòng", "Thêm hạng"]);
  });

  await check("TC-64", "Nhật ký thao tác quản lý", async (shot) => {
    await go("/audit");
    await must(shot, ["Nhật ký thao tác", "Người làm", "Đối tượng"]);
  });

  await check("TC-97", "Quản lý sơ đồ bán + giá phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Bán phòng", "Đặng Minh Tuấn"]);
    await go("/sales/rates");
    await must(shot, ["Giá phòng", "Ngày thường", "Cuối tuần"]);
  });

  await check("TC-05", "HK không vào trang nhân viên", async (shot) => {
    await logout();
    await login("uyen");
    await go("/staff");
    await ready();
    if (page.url().includes("/staff")) throw new Error("HK vẫn vào được /staff");
    await must(shot, ["Thêm"]);
  });

  await check("TC-24", "HK thấy việc khăn / dọn / thêm HK", async (shot) => {
    await go("/tasks");
    await must(shot, ["Thay 2 khăn tắm P.305", "Dọn phòng khách ở P.202", "Cần thêm HK ca này"]);
  });

  await check("TC-25", "HK tạo việc", async (shot) => {
    await go("/tasks/new");
    await must(shot, ["Kiểm INS"]);
  });

  await check("TC-98", "HK không vào bán phòng", async (shot) => {
    await go("/sales");
    await ready();
    if (page.url().includes("/sales")) throw new Error("HK vẫn vào được /sales");
    await must(shot, ["Thêm"]);
    const text = await pageText();
    if (text.includes("Bán phòng — sơ đồ")) throw new Error("HK thấy menu bán phòng");
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
  pass,
  fail,
  total: results.length,
  passRate: `${rate}%`,
  results,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  commit ${commit}  ${pass}/${results.length} = ${rate}%`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
