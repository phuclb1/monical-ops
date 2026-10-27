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

function skip(id, title, note) {
  results.push({ id, title, result: "skip", evidence: "", note });
  console.log(`SKIP ${id}  ${title}  — ${note}`);
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

function fold(s) {
  return String(s).replace(/[\u00a0\u202f]/g, " ").toLocaleLowerCase("vi");
}

function hasText(hay, needle) {
  return fold(hay).includes(fold(needle));
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
  const missing = needles.filter((n) => !hasText(text, n));
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

  await check("TC-03", "Lễ tân đăng nhập — về Đặt phòng", async (shot) => {
    await login("tuyen");
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Tìm booking", "Đang mở / đã trả"]);
    const text = await pageText();
    if (hasText(text, "Ca đang làm") || hasText(text, "Mở ca hiện tại")) {
      throw new Error("Lễ tân vẫn thấy ca / Today");
    }
  });

  skip("TC-10", "Tab khách đến — Nguyễn Thu Hà P.105", "retired: /reception đã gỡ");
  skip("TC-11", "Tab đang ở — Khoa + Hạnh", "retired: /reception đã gỡ");
  skip("TC-12", "Tab khách đi — Phạm Đức Anh P.102", "retired: /reception đã gỡ");
  skip("TC-13", "Thẻ check-in P.105: giao HK standby", "retired: cổng HK đã gỡ");

  skip("TC-14", "Khách gửi ô tô + timer đăng ký", "retired: /reception đã gỡ");
  skip("TC-15", "Khách đi — thiếu hóa đơn + dọn phòng trả", "retired: /reception đã gỡ");
  skip("TC-90", "PMS khách đến", "retired: /reception đã gỡ");
  skip("TC-16", "Xác nhận check-in PMS", "retired: /reception đã gỡ");
  skip("TC-91", "PMS khách đang ở", "retired: /reception đã gỡ");
  skip("TC-92", "PMS khách đi", "retired: /reception đã gỡ");
  skip("TC-20", "Bảng việc: thay khăn / dọn phòng / checkout", "retired: /tasks đã gỡ");
  skip("TC-21", "Việc «cần thêm HK» hiện với lễ tân", "retired: /tasks đã gỡ");
  skip("TC-22", "Tạo việc — loại lễ tân", "retired: /tasks đã gỡ");

  await check("TC-30", "Báo cáo ăn sáng từ booking", async (shot) => {
    await go("/kitchen");
    await must(shot, ["Ăn sáng", "Hôm nay", "Ngày mai", "suất", "Tổng quan 7 ngày"]);
    await go("/kitchen/forecast");
    await must(shot, ["dị ứng hải sản", "Người lớn"]);
  });

  await check("TC-40", "Sơ đồ phòng còn số phòng seed", async (shot) => {
    await go("/sales");
    await must(shot, ["Sơ đồ phòng", "305", "102", "Sẽ đến"]);
  });

  await check("TC-93", "Sơ đồ bán phòng lễ tân", async (shot) => {
    await go("/sales");
    await must(shot, ["Sơ đồ phòng", "Trống", "Đang ở", "Sẽ đến", "Đặt phòng"]);
    const text = await pageText();
    if (hasText(text, "Phòng bẩn")) throw new Error("Sơ đồ vẫn còn filter Phòng bẩn");
  });

  await check("TC-100", "Lọc nguồn Trực tiếp / OTA", async (shot) => {
    await go("/sales");
    await must(shot, ["Trực tiếp", "OTA"]);
  });

  await check("TC-102", "Quick filter bán phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Sẽ đến", "Check-in hôm nay", "Đang ở", "Trả hôm nay", "Mọi phòng"]);
    const text = await pageText();
    if (hasText(text, "Phòng bẩn")) throw new Error("Quick filter vẫn còn Phòng bẩn");
  });

  await check("TC-103", "Lọc Sẽ đến — Mai Thanh Hà", async (shot) => {
    await go("/sales?focus=booking");
    await must(shot, ["Sẽ đến", "Mai Thanh Hà"]);
  });

  await check("TC-104", "Lọc Đang ở — Đặng Minh Tuấn", async (shot) => {
    await go("/sales?focus=inhouse");
    await must(shot, ["Đang ở", "Đặng Minh Tuấn"]);
  });

  await check("TC-117", "Lọc Check-in hôm nay — An Phú", async (shot) => {
    await go("/sales?focus=arriving");
    await must(shot, ["Check-in hôm nay", "Công ty An Phú"]);
  });

  await check("TC-115", "Lọc OTA ẩn chỗ trực tiếp", async (shot) => {
    await go("/sales?origin=ezcloud");
    await must(shot, ["OTA", "Không khớp bộ lọc"]);
  });

  await check("TC-105", "Gantt 7 / 15 ngày", async (shot) => {
    await go("/sales");
    await must(shot, ["7 ngày sơ đồ", "Theo tầng", "Theo hạng phòng", "Tầng", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung", "Đặng Minh Tuấn", "Công ty An Phú"]);
    await go("/sales?view=15");
    await must(shot, ["15 ngày sơ đồ", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN"]);
    await go("/sales?group=type");
    await must(shot, ["Theo hạng phòng", "VIP", "FAMILY", "DELUXE", "Tầng"]);
  });

  await check("TC-106", "Gantt tháng", async (shot) => {
    await go("/sales?view=month");
    await must(shot, ["Tháng sơ đồ", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung", "Phòng"]);
  });

  await check("TC-94", "Chỗ bán seed P.401 / P.506", async (shot) => {
    await go("/sales");
    await must(shot, ["Đặng Minh Tuấn", "Công ty An Phú"]);
  });

  await check("TC-116", "Booking Mai Thanh Hà trên sơ đồ", async (shot) => {
    await go("/sales");
    await must(shot, ["Mai Thanh Hà", "Booking trong khung"]);
  });

  await check("TC-101", "Danh sách đặt phòng / booking", async (shot) => {
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Đang mở / đã trả", "Tìm booking", "Đặng Minh Tuấn", "Công ty An Phú", "Đoàn Minh Châu", "Lê Hoàng Nam"]);
  });

  await check("TC-140", "Tìm booking theo tên không dấu", async (shot) => {
    await go("/sales/bookings?q=dang+minh");
    await must(shot, ["Đặng Minh Tuấn", "kết quả", "Tìm booking"]);
    const text = await pageText();
    if (hasText(text, "Công ty An Phú")) throw new Error("Tìm Đặng vẫn ra An Phú");
  });

  await check("TC-141", "Tìm booking departed theo SĐT", async (shot) => {
    await go("/sales/bookings?q=0905555666");
    await must(shot, ["Lê Hoàng Nam", "Đã trả"]);
  });

  await check("TC-142", "Tìm booking không khớp", async (shot) => {
    await go("/sales/bookings?q=xyz-khong-co");
    await must(shot, ["Không có booking khớp", "Tìm booking"]);
  });

  await check("TC-114", "Booking 2 phòng Đoàn Minh Châu", async (shot) => {
    await go("/sales/bookings/bk-doan");
    await must(shot, ["Đoàn Minh Châu", "2 phòng", "P.304", "P.404", "Chiết khấu", "Đã đặt cọc", "Còn phải thu", "Phòng trong booking"]);
  });

  await check("TC-107", "Booking An Phú — chiết khấu, chưa cọc, còn thu", async (shot) => {
    await go("/sales/bookings/sale-506");
    await must(shot, ["Công ty An Phú", "Chiết khấu 10%", "Chưa đặt cọc", "Còn phải thu", "2.250.000₫"]);
  });

  await check("TC-108", "Booking Đặng — đã cọc, còn phải thu", async (shot) => {
    await go("/sales/bookings/sale-401");
    await must(shot, ["Đặng Minh Tuấn", "Đã đặt cọc", "500.000₫", "Còn phải thu", "1.900.000₫", "Thanh toán", "Thu đủ", "CK cá nhân", "Tiền mặt"]);
  });

  await check("TC-110", "Sửa booking: thông tin khách + nhật ký", async (shot) => {
    await go("/sales/bookings/sale-401");
    await must(shot, ["Nhật ký", "Tạo", "Đặng Minh Tuấn"]);
    await page.locator("summary", { hasText: "Sửa booking" }).click();
    await ready();
    await must(shot, [
      "Sửa booking",
      "Họ tên",
      "SĐT",
      "Người lớn",
      "Ô tô",
      "Xe máy",
      "Đổi số phòng cùng hạng hoặc nâng hạng",
      "Đặt cọc",
      "Thu đủ khi check-in",
      "Chiết khấu",
      "Lưu booking",
    ]);
    if (!(await page.locator('input[name="guestName"]').count())) {
      throw new Error("Form sửa booking thiếu ô tên khách");
    }
  });

  await check("TC-111", "Lễ tân không hủy booking", async (shot) => {
    await go("/sales/bookings/sale-508");
    await must(shot, ["Mai Thanh Hà", "In xác nhận"]);
    const text = await pageText();
    if (hasText(text, "Hủy booking")) throw new Error("Lễ tân vẫn thấy nút hủy booking");
    if (hasText(text, "No-show")) throw new Error("Lễ tân vẫn thấy nút no-show");
  });

  await check("TC-118", "In phiếu xác nhận booking", async (shot) => {
    await go("/sales/bookings/bk-doan/print");
    await must(shot, [
      "XÁC NHẬN ĐẶT PHÒNG",
      "Đoàn Minh Châu",
      "MONICAL Hotel Dalat",
      "FAMILY",
      "THÔNG TIN CHUNG",
      "Xe",
      "CHI TIẾT ĐẶT PHÒNG",
      "Tổng tiền sau chiết khấu",
      "Còn phải thanh toán",
      "ĐIỀU KHOẢN",
      "In phiếu",
      "Tải PDF",
    ]);
  });

  await check("TC-119b", "Lễ tân không vào báo cáo doanh thu", async (shot) => {
    await go("/reports/sales");
    await ready();
    if (page.url().includes("/reports/sales")) throw new Error("Lễ tân vẫn vào được /reports/sales");
    await page.screenshot({ path: shot, fullPage: true });
    const text = await pageText();
    if (text.includes("Doanh thu booking") && page.url().includes("/reports/sales")) {
      throw new Error("Lễ tân thấy báo cáo doanh thu");
    }
  });

  await check("TC-95", "Form bán phòng: giá, chiết khấu, mã PMS", async (shot) => {
    await go("/sales/new");
    await page.locator(".night-board").getByRole("button", { name: "Cả kỳ", exact: true }).first().click();
    await ready();
    await must(shot, ["Giá / đêm", "Chiết khấu", "Mã PMS", "Ô tô", "Xe máy"]);
  });

  await check("TC-99", "Form bán: nền tảng Booking / Agoda / ezCloud", async (shot) => {
    await go("/sales/new");
    await must(shot, ["Nền tảng", "Booking.com", "Agoda", "ezCloud"]);
  });

  await check("TC-109", "Form bán nhiều phòng + cọc / còn thu", async (shot) => {
    await go("/sales/new");
    const stays = page.locator(".night-board").getByRole("button", { name: "Cả kỳ", exact: true });
    if ((await stays.count()) < 2) throw new Error("Form bán không có hai phòng trống cả kỳ");
    await stays.nth(0).click();
    await stays.nth(1).click();
    await ready();
    await must(shot, [
      "Phòng trống theo đêm",
      "Lưu 2 phòng",
      "Chiết khấu",
      "Chưa đặt cọc",
      "Còn phải thu",
      "Ô tô",
      "Xe máy",
    ]);
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

  skip("TC-50", "Bàn giao gom việc / xe", "retired: /handover đã gỡ");
  skip("TC-70", "Checklist ca lễ tân", "retired: /shifts đã gỡ");

  await check("TC-64b", "Lễ tân không vào nhật ký", async (shot) => {
    await go("/audit");
    await ready();
    const text = await page.locator("body").innerText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes("Chỉ quản lý") && text.includes("Người làm")) {
      throw new Error("Lễ tân vẫn xem được nhật ký");
    }
  });

  skip("TC-72", "Today — việc HK theo phòng", "retired: /today đã gỡ");
  skip("TC-73", "Bảng việc — dọn khách ở / dọn trả seed", "retired: /tasks đã gỡ");
  skip("TC-74", "Chỗ bán P.401 — gửi HK dọn / kiểm trả", "retired: cổng HK đã gỡ");
  skip("TC-75", "Thẻ khách P.105 — gửi HK dọn / kiểm trả", "retired: /reception đã gỡ");
  skip("TC-76", "Chỗ bán P.506 chờ HK standby", "retired: cổng HK đã gỡ");
  skip("TC-143", "Booking An Phú link giao việc HK", "retired: cổng HK đã gỡ");

  await check("TC-74b", "Booking seed — nhận/trả thẳng, không HK", async (shot) => {
    await go("/sales/bookings/sale-506");
    await must(shot, ["Công ty An Phú", "Check in"]);
    let text = await pageText();
    if (hasText(text, "Giao việc HK") || hasText(text, "Yêu cầu HK")) {
      throw new Error("Booking An Phú vẫn còn cổng việc HK");
    }
    await go("/sales/bookings/sale-401");
    await must(shot, ["Đặng Minh Tuấn", "Check out"]);
    text = await pageText();
    if (hasText(text, "Giao việc HK") || hasText(text, "Yêu cầu HK")) {
      throw new Error("Booking Đặng vẫn còn cổng việc HK");
    }
  });

  await check("TC-130", "Lễ tân chỉ thấy booking mình tạo", async (shot) => {
    await go("/notifications");
    await must(shot, ["Thông báo", "Đặt phòng · Đặng Minh Tuấn", "Chỉ hiện thêm, sửa, hủy booking do bạn tạo"]);
    const text = await pageText();
    if (hasText(text, "Đặt phòng · Mai Thanh Hà")) throw new Error("Lễ tân thấy booking người khác tạo");
    if (hasText(text, "Sửa booking · Công ty An Phú")) throw new Error("Lễ tân thấy noti quản lý");
    if (hasText(text, "Thay khăn P.305")) throw new Error("Lễ tân thấy noti HK");
  });

  await logout();

  await check("TC-04", "Quản lý vào Dashboard booking — không còn Today / Việc", async (shot) => {
    await login("quanly");
    await must(shot, ["Dashboard", "Đặt phòng", "Sơ đồ", "Báo cáo"]);
    const text = await pageText();
    if (hasText(text, "Việc") && hasText(text, "Hôm nay")) {
      throw new Error("Dashboard quản lý vẫn còn nav điều phối");
    }
    await go("/today");
    if (new URL(page.url()).pathname === "/today") throw new Error("Quản lý vẫn vào được /today");
  });

  skip("TC-21b", "Quản lý thấy việc thêm HK", "retired: /tasks đã gỡ");
  skip("TC-23", "Tạo việc — loại quản lý", "retired: /tasks đã gỡ");

  await check("TC-60", "Staff: 3 lễ tân + 1 HK", async (shot) => {
    await go("/staff");
    await must(shot, ["Ngân Lễ tân", "Thu Lễ tân", "Tuyến Lễ tân", "Uyên HK"]);
  });

  skip("TC-61", "Lịch lễ tân tuần", "retired: /roster đã gỡ");

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
    await must(shot, ["Sơ đồ phòng", "Đặng Minh Tuấn"]);
    await go("/rooms/manage");
    await must(shot, ["Hạng phòng", "Giá thường", "Giá lễ tết", "Sức chứa"]);
  });

  await check("TC-111b", "Quản lý hủy booking — xác nhận hoàn cọc", async (shot) => {
    await go("/sales/bookings/sale-508");
    await must(shot, ["Mai Thanh Hà", "Hủy booking", "No-show"]);
    await page.getByRole("button", { name: "Hủy booking" }).click();
    await ready();
    await must(shot, ["Xác nhận đã hoàn cọc", "Đã hoàn cọc", "300.000"]);
  });

  await check("TC-119", "Báo cáo doanh thu bán phòng", async (shot) => {
    await go("/reports/sales");
    await must(shot, [
      "Doanh thu bán phòng",
      "Tháng",
      "Quý",
      "Năm",
      "Doanh thu booking",
      "Đã đặt cọc",
      "Phải thu",
      "Doanh thu ghi nhận",
      "CK cá nhân",
      "Tiền mặt",
    ]);
  });

  await check("TC-131", "Quản lý thấy mọi thêm/sửa booking", async (shot) => {
    await go("/notifications");
    await must(shot, [
      "Thông báo",
      "Mọi thêm, sửa, hủy booking đều hiện ở đây",
      "Đặt phòng · Đặng Minh Tuấn",
      "Đặt phòng · Mai Thanh Hà",
      "Sửa booking · Công ty An Phú",
    ]);
    const text = await pageText();
    if (hasText(text, "Thay khăn P.305")) throw new Error("Quản lý thấy noti HK");
  });

  await check("TC-120", "Chủ sở hữu vào doanh thu tháng/quý/năm", async (shot) => {
    await logout();
    await login("chusohuu");
    await must(shot, ["Doanh thu", "Tháng", "Quý", "Năm", "Doanh thu ghi nhận", "Doanh thu booking"]);
    if (!page.url().includes("/owner")) throw new Error(`Owner không vào /owner · ${page.url()}`);
  });

  await check("TC-121", "Chủ sở hữu xem thông tin khách theo kỳ", async (shot) => {
    await go("/owner/guests");
    await must(shot, ["Thông tin khách", "Tháng", "Quý", "Năm", "Người lớn", "Trẻ em", "Khách nhận trong kỳ"]);
  });

  await check("TC-122", "Chủ sở hữu không vào vận hành Today", async (shot) => {
    await go("/today");
    await ready();
    if (page.url().includes("/today")) throw new Error("Owner vẫn vào được /today");
    await must(shot, ["Doanh thu"]);
  });

  await check("TC-05", "HK bị khóa login", async (shot) => {
    await logout();
    await go("/login");
    await page.locator('input[name="username"]').fill("uyen");
    await page.locator('input[name="password"]').fill("123456");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/\/login/, { timeout: 20000 });
    await ready();
    if (!new URL(page.url()).pathname.startsWith("/login")) throw new Error("HK vẫn vào được app");
    await must(shot, ["Module vận hành tạm dừng"]);
  });

  skip("TC-24", "HK thấy việc khăn / dọn / thêm HK", "retired: HK khóa login");
  skip("TC-25", "HK tạo việc", "retired: HK khóa login");
  skip("TC-98", "HK không vào bán phòng", "retired: HK khóa login — xem TC-05");
  skip("TC-132", "HK không thấy noti booking", "retired: HK khóa login");
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.result === "pass").length;
const fail = results.filter((r) => r.result === "fail").length;
const skipped = results.filter((r) => r.result === "skip").length;
const ran = pass + fail;
const rate = ran ? Math.round((pass / ran) * 100) : 0;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit,
  env: base,
  pass,
  fail,
  skip: skipped,
  total: results.length,
  passRate: `${rate}%`,
  results,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  commit ${commit}  ${pass}/${ran} = ${rate}%  skip ${skipped}`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
