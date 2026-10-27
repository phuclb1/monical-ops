import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.OPS_URL || "https://ops-staging.monicalhoteldalat.com").replace(/\/$/, "");
const user = process.env.OPS_USER || "quanly";
const password = process.env.OPS_PASSWORD || "123456";

function gitCommit() {
  const short = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: root }).toString().trim().length > 0;
  return dirty ? `${short}-dirty` : short;
}

const commit = gitCommit();
const runId = process.env.QA_RUN_ID || `PERF-PWA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-stg`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  { id: "home", path: "/" },
  { id: "sales", path: "/sales" },
  { id: "sales-15", path: "/sales?view=15" },
  { id: "bookings", path: "/sales/bookings" },
];

const BUDGET = { ttfbMs: 2000, loadMs: 5000, lcpMs: 4000, loginPostMs: 15000 };

function round(n) {
  return Math.round(Number(n) || 0);
}

async function collectNav(page) {
  return page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
    let lcp = 0;
    try {
      lcp = performance.getEntriesByType("largest-contentful-paint").at(-1)?.startTime || 0;
    } catch {
      lcp = 0;
    }
    if (!lcp) {
      lcp = await new Promise((resolve) => {
        let latest = 0;
        const observer = new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) latest = last.startTime;
        });
        try {
          observer.observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          resolve(0);
          return;
        }
        setTimeout(() => {
          observer.disconnect();
          resolve(latest);
        }, 400);
      });
    }
    return {
      ttfbMs: nav ? nav.responseStart : 0,
      loadMs: nav ? nav.loadEventEnd : 0,
      fcpMs: paint["first-contentful-paint"] || 0,
      lcpMs: lcp,
      workerMs: nav?.workerStart ? nav.responseStart - nav.workerStart : 0,
      transferKb: nav ? Math.round((nav.transferSize || 0) / 1024) : 0,
      encodedKb: nav ? Math.round((nav.encodedBodySize || 0) / 1024) : 0,
      delivery: nav?.deliveryType || "",
    };
  });
}

async function swState(page) {
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false, controlled: false, script: "" };
    const ready = await navigator.serviceWorker.ready;
    return {
      supported: true,
      controlled: Boolean(navigator.serviceWorker.controller),
      script: ready.active?.scriptURL || "",
    };
  });
}

async function ensureControlled(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 8000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  });
  let state = await swState(page);
  if (!state.controlled) {
    await page.reload({ waitUntil: "load", timeout: 45000 });
    state = await swState(page);
  }
  return state;
}

async function measure(page, path) {
  const started = Date.now();
  const response = await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(500);
  const nav = await collectNav(page);
  const heading = await page.locator("h1").first().textContent().catch(() => "");
  return {
    path,
    status: response?.status() ?? 0,
    fromServiceWorker: Boolean(response?.fromServiceWorker()),
    wallMs: Date.now() - started,
    heading: (heading || "").trim(),
    ...nav,
    ttfbMs: round(nav.ttfbMs),
    loadMs: round(nav.loadMs),
    fcpMs: round(nav.fcpMs),
    lcpMs: round(nav.lcpMs),
    workerMs: round(nav.workerMs),
  };
}

function verdict(row, { offline = false, loginPost = false } = {}) {
  const fails = [];
  if (!row.fromServiceWorker) fails.push("không qua service worker");
  if (offline) {
    if (row.heading === "Mất mạng ngắn") fails.push("rơi trang offline dù đã có cache");
    if (row.ttfbMs > BUDGET.ttfbMs) fails.push(`TTFB ${row.ttfbMs}ms > ${BUDGET.ttfbMs}ms`);
    if (row.loadMs > BUDGET.loadMs) fails.push(`load ${row.loadMs}ms > ${BUDGET.loadMs}ms`);
    return fails;
  }
  if (row.status && row.status >= 400) fails.push(`HTTP ${row.status}`);
  if (loginPost) {
    if (row.ttfbMs > BUDGET.loginPostMs) fails.push(`login ${row.ttfbMs}ms > ${BUDGET.loginPostMs}ms`);
    return fails.filter((item) => !item.startsWith("không qua"));
  }
  if (row.ttfbMs > BUDGET.ttfbMs) fails.push(`TTFB ${row.ttfbMs}ms > ${BUDGET.ttfbMs}ms`);
  if (row.loadMs > BUDGET.loadMs) fails.push(`load ${row.loadMs}ms > ${BUDGET.loadMs}ms`);
  if (row.lcpMs > BUDGET.lcpMs) fails.push(`LCP ${row.lcpMs}ms > ${BUDGET.lcpMs}ms`);
  return fails;
}

const results = [];

function record(id, title, row, extra) {
  const fails = verdict(row, extra);
  const item = { id, title, result: fails.length ? "fail" : "pass", note: fails.join(" · "), ...row };
  results.push(item);
  const mark = item.result === "pass" ? "PASS" : "FAIL";
  console.log(
    `${mark} ${id}  ${title}  sw=${row.fromServiceWorker ? "yes" : "no"}  ttfb=${row.ttfbMs}ms  fcp=${row.fcpMs}ms  lcp=${row.lcpMs}ms  load=${row.loadMs}ms  worker=${row.workerMs}ms  ${row.heading}`,
  );
  if (fails.length) console.error(`     ${item.note}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  serviceWorkers: "allow",
});
const page = await context.newPage();

try {
  await page.goto(`${base}/login`, { waitUntil: "load", timeout: 45000 });
  const sw = await ensureControlled(page);
  console.log(`SW controlled=${sw.controlled} script=${sw.script}`);
  if (!sw.controlled) throw new Error("Service worker không kiểm soát trang");

  const loginStarted = Date.now();
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/login") && res.request().method() === "POST", { timeout: 30000 }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(500);
  const loginNav = await collectNav(page);
  record(
    "PWA-LOGIN",
    `POST /api/auth/login (${user})`,
    {
      path: "/api/auth/login",
      status: loginResponse.status(),
      fromServiceWorker: false,
      wallMs: Date.now() - loginStarted,
      heading: "",
      ttfbMs: Date.now() - loginStarted,
      loadMs: round(loginNav.loadMs),
      fcpMs: round(loginNav.fcpMs),
      lcpMs: round(loginNav.lcpMs),
      workerMs: round(loginNav.workerMs),
      transferKb: loginNav.transferKb,
      encodedKb: loginNav.encodedKb,
      delivery: loginNav.delivery,
    },
    { loginPost: true },
  );

  await ensureControlled(page);

  for (const route of ROUTES) {
    const prime = await measure(page, route.path);
    record(`PWA-${route.id}-prime`, `GET ${route.path} qua SW`, prime);
    const again = await measure(page, route.path);
    record(`PWA-${route.id}-again`, `GET ${route.path} mở lại`, again);
  }

  await context.setOffline(true);
  for (const route of ROUTES) {
    try {
      const cached = await measure(page, route.path);
      record(`PWA-${route.id}-offline`, `GET ${route.path} offline cache`, cached, { offline: true });
    } catch (error) {
      record(`PWA-${route.id}-offline`, `GET ${route.path} offline cache`, {
        path: route.path,
        status: 0,
        fromServiceWorker: false,
        wallMs: 0,
        heading: "",
        ttfbMs: 0,
        loadMs: 0,
        fcpMs: 0,
        lcpMs: 0,
        workerMs: 0,
        transferKb: 0,
        encodedKb: 0,
        delivery: "",
        error: error instanceof Error ? error.message : String(error),
      }, { offline: true });
    }
  }
} finally {
  await context.setOffline(false).catch(() => {});
  await browser.close();
}

const pass = results.filter((row) => row.result === "pass").length;
const fail = results.filter((row) => row.result === "fail").length;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit,
  env: base,
  user,
  budget: BUDGET,
  pass,
  fail,
  total: results.length,
  passRate: `${results.length ? Math.round((pass / results.length) * 100) : 0}%`,
  results,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  commit ${commit}  env ${base}`);
console.log(`PASS ${pass}  FAIL ${fail}  ${manifest.passRate}`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
if (fail) process.exitCode = 1;
