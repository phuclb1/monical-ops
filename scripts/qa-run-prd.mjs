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

  skip("TC-03", "Lễ tân đăng nhập — Today ca đang mở", "prd chỉ có quanly, không có tài khoản lễ tân");

  await check("TC-04", "Quản lý Today — không bắt mở ca", async (shot) => {
    await login("quanly");
    signedIn = true;
    const text = await page.locator("body").innerText();
    await page.screenshot({ path: shot, fullPage: true });
    if (text.includes("Mở ca hiện tại") && !text.includes("Ca đang làm") && !text.includes("Ca lễ tân chưa mở")) {
      throw new Error("Quản lý vẫn bị màn bắt mở ca");
    }
    if (!text.includes("Ca đang làm") && !text.includes("Ca lễ tân chưa mở") && !text.includes("Hôm nay")) {
      throw new Error("Today quản lý không ra trạng thái ca");
    }
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
  skip("TC-72", "Today — task nhận/trả theo phòng", "prd không seed khách đến/đi hôm nay");
  skip("TC-73", "Bảng việc — nhận P.105 / trả P.102 / nhận P.506", "prd không seed việc demo");
  skip("TC-74", "Task nhận P.105 có checklist", "prd không seed kịch bản khách");
  skip("TC-75", "Thẻ khách P.105 cùng checklist nhận", "prd không seed kịch bản khách");
  skip("TC-76", "Chỗ bán P.506 có checklist nhận phòng", "prd không seed chỗ bán demo");
  skip("TC-20", "Bảng việc: thay khăn / dọn phòng / checkout", "prd không seed việc demo");
  skip("TC-21", "Việc «cần thêm HK» hiện với lễ tân", "prd không có lễ tân / việc demo");
  skip("TC-21b", "Quản lý thấy việc thêm HK", "prd không seed việc demo");
  skip("TC-24", "HK thấy khăn / dọn / thêm HK", "prd không có user HK");
  skip("TC-25", "HK tạo việc", "prd không có user HK");
  skip("TC-98", "HK không vào bán phòng", "prd không có user HK");
  skip("TC-30", "Báo ăn sáng ngày mai (số + dị ứng P.105)", "prd không seed số ăn sáng demo");

  async function checkAuthed(id, title, fn) {
    if (!signedIn) {
      skip(id, title, "chưa đăng nhập được (POST /api/auth/login 500)");
      return;
    }
    await check(id, title, fn);
  }

  await checkAuthed("TC-10p", "Lễ tân — các tab khách (prd)", async (shot) => {
    await go("/reception?tab=arriving");
    await must(shot, ["Lễ tân", "Khách đến"]);
  });

  await checkAuthed("TC-20p", "Bảng việc trống / cột Mới", async (shot) => {
    await go("/tasks");
    await must(shot, ["Bảng việc", "Tạo việc"]);
  });

  await checkAuthed("TC-22", "Tạo việc — loại lễ tân (quản lý cũng tạo được)", async (shot) => {
    await go("/tasks/new");
    await must(shot, ["Thay khăn", "Dọn phòng khách ở"]);
  });

  await checkAuthed("TC-23", "Tạo việc — loại quản lý", async (shot) => {
    await go("/tasks/new");
    await must(shot, ["Theo dõi việc trễ"]);
  });

  await checkAuthed("TC-30p", "Bếp / dự báo ăn sáng", async (shot) => {
    await go("/kitchen");
    await must(shot, ["Người lớn", "Trẻ em"]);
  });

  await checkAuthed("TC-40", "Danh sách phòng", async (shot) => {
    await go("/rooms");
    await must(shot, ["305", "102", "Sẽ đến"]);
  });

  await checkAuthed("TC-93", "Sơ đồ bán phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Bán phòng", "Trống", "Sẽ đến", "Đặt phòng"]);
  });

  skip("TC-94", "Chỗ bán seed P.401 / P.506", "prd không seed chỗ bán demo");
  skip("TC-103", "Lọc Sẽ đến — Mai Thanh Hà", "prd không seed chỗ bán demo");
  skip("TC-104", "Lọc Đang ở — Đặng Minh Tuấn", "prd không seed chỗ bán demo");
  skip("TC-107", "Booking An Phú — chiết khấu / cọc", "prd không seed chỗ bán demo");
  skip("TC-108", "Booking Đặng — đã cọc", "prd không seed chỗ bán demo");
  skip("TC-110", "Sửa booking không sửa khách", "prd không seed chỗ bán demo");
  skip("TC-111", "Nút hủy booking", "prd không seed chỗ bán demo");
  skip("TC-114", "Booking 2 phòng Đoàn Minh Châu", "prd không seed chỗ bán demo");
  skip("TC-118", "In phiếu xác nhận booking", "prd không seed chỗ bán demo");
  skip("TC-116", "Giữ chỗ 14 ngày — Mai Thanh Hà", "prd không seed chỗ bán demo");
  skip("TC-117", "Lọc Check-in hôm nay — An Phú", "prd không seed chỗ bán demo");

  await checkAuthed("TC-102", "Quick filter bán phòng", async (shot) => {
    await go("/sales");
    await must(shot, ["Sẽ đến", "Check-in hôm nay", "Đang ở", "Trả hôm nay", "Phòng bẩn", "Mọi phòng"]);
  });

  await checkAuthed("TC-115", "Lọc nguồn Ops / ezCloud", async (shot) => {
    await go("/sales");
    await must(shot, ["Ops", "ezCloud"]);
  });

  await checkAuthed("TC-105", "Gantt tuần", async (shot) => {
    await go("/sales?view=week");
    await must(shot, ["Tuần sơ đồ", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung"]);
  });

  await checkAuthed("TC-106", "Gantt tháng", async (shot) => {
    await go("/sales?view=month");
    await must(shot, ["Tháng sơ đồ", "ĐÊM TRỐNG", "ĐÊM ĐÃ BÁN", "Booking trong khung"]);
  });

  await checkAuthed("TC-101", "Danh sách đặt phòng", async (shot) => {
    await go("/sales/bookings");
    await must(shot, ["Đặt phòng", "Đang mở"]);
  });

  await checkAuthed("TC-95", "Form bán phòng: giá, chiết khấu, mã PMS", async (shot) => {
    await go("/sales/new");
    await must(shot, ["Giá / đêm", "Chiết khấu", "Mã PMS"]);
  });

  await checkAuthed("TC-109", "Form bán nhiều phòng + cọc / còn thu", async (shot) => {
    await go("/sales/new");
    const boxes = page.locator('input[name="roomId"][type="checkbox"]');
    if ((await boxes.count()) < 2) throw new Error("Form bán không có chọn nhiều phòng");
    await boxes.nth(1).check();
    await ready();
    await must(shot, ["Phòng · chọn nhiều cho cùng booking", "Đã chọn 2 phòng", "Chưa đặt cọc", "Còn phải thu"]);
  });

  await checkAuthed("TC-96", "Giá phòng ngày thường / cuối tuần", async (shot) => {
    await go("/sales/rates");
    await must(shot, ["Giá phòng", "Ngày thường", "Cuối tuần"]);
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

  await checkAuthed("TC-50", "Bàn giao", async (shot) => {
    await go("/handover");
    await must(shot, ["Bàn giao"]);
  });

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

  await checkAuthed("TC-61", "Lịch lễ tân — xếp 1 lần", async (shot) => {
    await go("/roster");
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    const standing = text.includes("Áp dụng từ hôm nay") || text.includes("Lịch đang áp dụng") || text.includes("lịch tuần");
    if (!standing) throw new Error("Không nhận ra trang lịch lễ tân");
  });

  if (signedIn) {
    await go("/roster");
    const weekFilled = await page.evaluate(() => {
      const picks = [...document.querySelectorAll("select[name^='w-']")].map((el) => el.value);
      return picks.length >= 21 && picks.every(Boolean);
    });
    if (!weekFilled) {
      skip("TC-61s", "Lưu lịch tuần (batch D1)", "lưới tuần chưa đủ 21 ca — không ghi lịch thiếu");
    } else {
      await check("TC-61s", "Lưu lịch tuần (batch D1)", async (shot) => {
        await Promise.all([
          page.waitForURL(/[?&]ok=week|[?&]error=/, { timeout: 25000 }),
          page.getByRole("button", { name: "Áp dụng từ hôm nay" }).click(),
        ]);
        await ready();
        const text = await pageText();
        await page.screenshot({ path: shot, fullPage: true });
        if (text.includes("Failed query") || page.url().includes("error=")) {
          throw new Error(`Lưu lịch fail · ${page.url()}`);
        }
        if (!text.includes("Đã áp dụng lịch") && !page.url().includes("ok=week")) {
          throw new Error("Không thấy xác nhận lưu lịch");
        }
      });
    }
  } else {
    skip("TC-61s", "Lưu lịch tuần (batch D1)", "chưa đăng nhập được (POST /api/auth/login 500)");
  }

  await checkAuthed("TC-70", "Ca / checklist (quản lý)", async (shot) => {
    await go("/shifts");
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    const ok =
      text.includes("Đầu ca") ||
      text.includes("Cuối ca") ||
      text.includes("Mở ca hộ") ||
      text.includes("Ca lễ tân chưa mở") ||
      text.includes("Đang mở") ||
      text.includes("Mở ca");
    if (!ok) throw new Error("Trang ca không nhận ra checklist đầu/cuối ca");
  });

  await checkAuthed("TC-83", "Prompt bật thông báo điện thoại", async (shot) => {
    await go("/today");
    const text = await pageText();
    await page.screenshot({ path: shot, fullPage: true });
    if (!text.includes("Thông báo điện thoại") && !text.includes("Thêm vào Màn hình chính") && !text.includes("Bật")) {
      throw new Error("Không thấy UI push");
    }
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
