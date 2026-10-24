import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.OPS_URL || "https://platform.monicalhoteldalat.com";

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `R-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-prd`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const results = [];

async function ready() {
  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await ready();
}

async function login(username) {
  await go("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill("123456");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 25000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await ready();
  if (page.url().includes("/login") || page.url().startsWith("chrome-error://")) {
    throw new Error(`Login không vào app · URL ${page.url()}`);
  }
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
  return `${body}\n${values}`;
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

function skip(id, title, note) {
  results.push({ id, title, result: "skip", evidence: "", note });
  console.log(`SKIP ${id}  ${title}  — ${note}`);
}

async function must(shot, needles) {
  await page.screenshot({ path: shot, fullPage: true });
  const text = await pageText();
  const missing = needles.filter((n) => !text.includes(n));
  if (missing.length) throw new Error(`Thiếu: ${missing.join(" | ")} · URL ${page.url()}`);
}

let signedIn = false;

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
    if (page.url().startsWith("chrome-error://") || (await page.locator("body").innerText()).includes("HTTP ERROR 500")) {
      throw new Error("POST /api/auth/login trả 500 thay vì /login?error=1");
    }
    await must(shot, ["Sai tài khoản hoặc mật khẩu"]);
  });

  skip("TC-03", "Lễ tân đăng nhập — Đặt phòng", "prd chỉ có quanly, không có tài khoản lễ tân");

  await check("TC-04", "Quản lý Dashboard booking — không còn Today", async (shot) => {
    await login("quanly");
    signedIn = true;
    await must(shot, ["Dashboard", "Đặt phòng", "Sơ đồ"]);
    await go("/today");
    if (new URL(page.url()).pathname === "/today") throw new Error("Quản lý vẫn vào được /today");
  });

  skip("TC-05", "HK không vào trang nhân viên", "prd không có user HK");
  skip("TC-10", "Tab khách đến — Nguyễn Thu Hà P.105", "prd không seed kịch bản khách");
  skip("TC-11", "Tab đang ở — Khoa + Hạnh", "prd không seed kịch bản khách");
  skip("TC-12", "Tab khách đi — Phạm Đức Anh P.102", "prd không seed kịch bản khách");
  skip("TC-13", "Thẻ khách check-in P.105", "prd không seed kịch bản khách");
  skip("TC-14", "Khách gửi ô tô + timer đăng ký", "prd không seed kịch bản khách");
  skip("TC-15", "Khách đi — thiếu hóa đơn + dọn phòng trả", "prd không seed kịch bản khách");
  skip("TC-16", "Bấm xác nhận check-in PMS", "prd không seed kịch bản khách");
  skip("TC-90", "PMS khách đến — booking xong, chưa check-in", "prd không seed kịch bản khách");
  skip("TC-91", "PMS khách đang ở — đã check-in PMS", "prd không seed kịch bản khách");
  skip("TC-92", "PMS khách đi — chưa checkout / hóa đơn", "prd không seed kịch bản khách");
  skip("TC-72", "Today — việc HK theo phòng", "prd không seed khách đến/đi hôm nay");
  skip("TC-73", "Bảng việc — dọn khách ở / dọn trả seed", "prd không seed việc demo");
  skip("TC-74", "Chỗ bán P.401 inhouse — gửi HK dọn / kiểm trả", "prd không seed chỗ bán demo");
  skip("TC-75", "Thẻ khách P.105 giao HK standby trước nhận", "prd không seed kịch bản khách");
  skip("TC-76", "Chỗ bán P.506 chờ HK standby rồi mới nhận", "prd không seed chỗ bán demo");
  skip("TC-140", "Tìm booking theo tên không dấu", "prd không seed chỗ bán demo");
  skip("TC-141", "Tìm booking departed theo SĐT", "prd không seed chỗ bán demo");
  skip("TC-142", "Tìm booking không khớp", "prd không seed chỗ bán demo");
  skip("TC-143", "Booking An Phú link giao việc HK từng chỗ", "prd không seed chỗ bán demo");
  skip("TC-130", "Lễ tân chỉ thấy booking mình tạo", "prd không có tài khoản lễ tân / seed noti");
  skip("TC-20", "Bảng việc: thay khăn / dọn phòng / checkout", "prd không seed việc demo");
  skip("TC-21", "Việc «cần thêm HK» hiện với lễ tân", "prd không có lễ tân / việc demo");
  skip("TC-21b", "Quản lý thấy việc thêm HK", "prd không seed việc demo");
  skip("TC-24", "HK thấy khăn / dọn / thêm HK", "prd không có user HK");
  skip("TC-25", "HK tạo việc", "prd không có user HK");
  skip("TC-98", "HK không vào bán phòng", "prd không có user HK");
  skip("TC-132", "HK không thấy noti booking", "prd không có user HK");
  skip("TC-30", "Báo ăn sáng ngày mai (số + dị ứng P.105)", "prd không seed số ăn sáng demo");

  async function checkAuthed(id, title, fn) {
    if (!signedIn) {
      skip(id, title, "chưa đăng nhập được (POST /api/auth/login 500)");
      return;
    }
    await check(id, title, fn);
  }

  skip("TC-10p", "Lễ tân — các tab khách (prd)", "retired: /reception đã gỡ");
  skip("TC-20p", "Bảng việc trống / cột Mới", "retired: /tasks đã gỡ");
  skip("TC-22", "Tạo việc — loại lễ tân", "retired: /tasks đã gỡ");
  skip("TC-23", "Tạo việc — loại quản lý", "retired: /tasks đã gỡ");

  await checkAuthed("TC-30p", "Bếp / báo cáo ăn sáng", async (shot) => {
    await go("/kitchen");
    await must(shot, ["Ăn sáng", "Hôm nay", "suất"]);
    await go("/kitchen/forecast");
    await must(shot, ["Người lớn", "Trẻ em"]);
  });

  await checkAuthed("TC-40", "Sơ đồ phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Sơ đồ phòng", "Sẽ đến", "Đặt phòng"]);
  });

  await checkAuthed("TC-93", "Sơ đồ bán phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Sơ đồ phòng", "Trống", "Sẽ đến", "Đặt phòng"]);
  });

  skip("TC-94", "Chỗ bán seed P.401 / P.506", "prd không seed chỗ bán demo");
  skip("TC-103", "Lọc Sẽ đến — Mai Thanh Hà", "prd không seed chỗ bán demo");
  skip("TC-104", "Lọc Đang ở — Đặng Minh Tuấn", "prd không seed chỗ bán demo");
  skip("TC-107", "Booking An Phú — chiết khấu / cọc", "prd không seed chỗ bán demo");
  skip("TC-108", "Booking Đặng — đã cọc", "prd không seed chỗ bán demo");
  skip("TC-110", "Sửa booking thông tin khách + nhật ký", "prd không seed chỗ bán demo");
  skip("TC-111", "Nút hủy booking", "prd không seed chỗ bán demo");
  skip("TC-114", "Booking 2 phòng Đoàn Minh Châu", "prd không seed chỗ bán demo");
  skip("TC-118", "In phiếu xác nhận booking", "prd không seed chỗ bán demo");
  skip("TC-116", "Giữ chỗ 14 ngày — Mai Thanh Hà", "prd không seed chỗ bán demo");
  skip("TC-117", "Lọc Check-in hôm nay — An Phú", "prd không seed chỗ bán demo");

  await checkAuthed("TC-102", "Quick filter bán phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Sẽ đến", "Check-in hôm nay", "Đang ở", "Trả hôm nay", "Mọi phòng"]);
  });

  await checkAuthed("TC-115", "Lọc nguồn Trực tiếp / OTA", async (shot) => {
    await go("/sales");
    await must(shot, ["Trực tiếp", "OTA"]);
  });

  await checkAuthed("TC-105", "Gantt 7 / 15 ngày", async (shot) => {
    await go("/sales");
    await must(shot, ["7 ngày sơ đồ", "Theo tầng", "Theo hạng phòng", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung"]);
    await go("/sales?view=15");
    await must(shot, ["15 ngày sơ đồ", "ĐÊM TRỐNG"]);
    await go("/sales?group=type");
    await must(shot, ["Theo hạng phòng", "VIP", "FAMILY"]);
  });

  await checkAuthed("TC-106", "Gantt tháng", async (shot) => {
    await go("/sales?view=month");
    await must(shot, ["Tháng sơ đồ", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung"]);
  });

  await checkAuthed("TC-101", "Danh sách đặt phòng", async (shot) => {
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Đang mở"]);
  });

  await checkAuthed("TC-119", "Báo cáo doanh thu bán phòng", async (shot) => {
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
      "Tiền chuyển khoản",
      "Tiền mặt",
    ]);
  });

  await checkAuthed("TC-131", "Quản lý vào thông báo booking", async (shot) => {
    await go("/notifications");
    await must(shot, ["Thông báo", "Mọi thêm, sửa, hủy booking đều hiện ở đây"]);
  });

  await checkAuthed("TC-95", "Form bán phòng: giá, chiết khấu, mã PMS", async (shot) => {
    await go("/sales/new");
    await must(shot, ["Giá / đêm", "Chiết khấu", "Mã PMS", "Ô tô", "Xe máy"]);
  });

  await checkAuthed("TC-109", "Form bán nhiều phòng + cọc / còn thu", async (shot) => {
    await go("/sales/new");
    const boxes = page.locator('input[name="roomId"][type="checkbox"]');
    if ((await boxes.count()) < 2) throw new Error("Form bán không có chọn nhiều phòng");
    await boxes.nth(1).check();
    await ready();
    await must(shot, ["Hạng phòng · chọn 1 hoặc nhiều phòng", "Đã chọn 2 phòng", "Chưa đặt cọc", "Còn phải thu", "Ô tô", "Xe máy"]);
  });

  await checkAuthed("TC-96", "Giá thường / lễ tết / sức chứa trên hạng phòng", async (shot) => {
    await go("/sales/rates");
    await must(shot, ["Hạng phòng", "Giá thường", "Giá lễ tết", "Sức chứa"]);
  });

  await checkAuthed("TC-41", "Quản lý hạng phòng", async (shot) => {
    await go("/rooms/manage");
    await page.screenshot({ path: shot, fullPage: true });
    const text = await pageText();
    if (page.url().includes("/login")) throw new Error("Bị đá ra login");
    if (!text.includes("hạng") && !text.includes("Hạng") && !text.includes("phòng") && !text.includes("Phòng")) {
      throw new Error(`Trang manage không nhận ra · ${page.url()}`);
    }
  });

  skip("TC-50", "Bàn giao", "retired: /handover đã gỡ");

  await checkAuthed("TC-60", "Staff prd — chỉ quản lý", async (shot) => {
    await go("/staff");
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    if (!text.includes("quanly") && !text.toLowerCase().includes("quản lý")) {
      throw new Error("Không thấy tài khoản quản lý");
    }
    if (text.includes("Ngân Lễ tân") || text.includes("Uyên HK")) {
      throw new Error("prd vẫn còn nhân viên demo");
    }
  });

  await checkAuthed("TC-64", "Nhật ký thao tác quản lý", async (shot) => {
    await go("/audit");
    await must(shot, ["Nhật ký thao tác", "Người làm"]);
  });

  skip("TC-61", "Lịch lễ tân — xếp 1 lần", "retired: /roster đã gỡ");
  skip("TC-61s", "Lưu lịch tuần (batch D1)", "retired: /roster đã gỡ");
  skip("TC-70", "Ca / checklist (quản lý)", "retired: /shifts đã gỡ");
  skip("TC-83", "Prompt bật thông báo trên Today", "retired: /today đã gỡ");

  await check("TC-120", "Chủ sở hữu vào doanh thu tháng/quý/năm", async (shot) => {
    await logout();
    await login("chusohuu");
    signedIn = true;
    await must(shot, ["Doanh thu", "Tháng", "Quý", "Năm", "Doanh thu ghi nhận"]);
    if (!page.url().includes("/owner")) throw new Error(`Owner không vào /owner · ${page.url()}`);
  });

  await checkAuthed("TC-121", "Chủ sở hữu xem thông tin khách theo kỳ", async (shot) => {
    await go("/owner/guests");
    await must(shot, ["Thông tin khách", "Tháng", "Quý", "Năm", "Khách nhận trong kỳ"]);
  });

  await checkAuthed("TC-122", "Chủ sở hữu không vào vận hành Today", async (shot) => {
    await go("/today");
    await ready();
    if (page.url().includes("/today")) throw new Error("Owner vẫn vào được /today");
    await must(shot, ["Doanh thu"]);
  });

  await checkAuthed("TC-06", "Đăng xuất về login", async (shot) => {
    await logout();
    await must(shot, ["Đăng nhập", "Tài khoản"]);
  });
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
console.log(`\nRUN ${runId}  commit ${commit}  env ${base}`);
console.log(`PASS ${pass}  FAIL ${fail}  SKIP ${skipped}  ran ${ran} = ${rate}%`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
