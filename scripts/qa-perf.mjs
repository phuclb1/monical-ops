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
const runId = process.env.QA_RUN_ID || `PERF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-1`;
const outDir = join(root, "qa", "evidence", runId);
mkdirSync(outDir, { recursive: true });

const ROUTES = [
  { id: "login", path: "/login", auth: false },
  { id: "today", path: "/today", auth: true },
  { id: "sales", path: "/sales", auth: true },
  { id: "sales-15", path: "/sales?view=15", auth: true },
  { id: "sales-month", path: "/sales?view=month", auth: true },
  { id: "bookings", path: "/sales/bookings", auth: true },
  { id: "kitchen", path: "/kitchen", auth: true },
  { id: "rooms", path: "/rooms", auth: true },
  { id: "tasks", path: "/tasks", auth: true },
  { id: "reception", path: "/reception", auth: true },
  { id: "reports", path: "/reports/sales", auth: true },
  { id: "notifications", path: "/notifications", auth: true },
];

const BUDGET = {
  ttfbMs: 2000,
  loadMs: 5000,
  lcpMs: 4000,
  loginPostMs: 15000,
};

function round(n) {
  return Math.round(Number(n) || 0);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function collectNav(page) {
  return page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime]));
    const resources = performance.getEntriesByType("resource");
    let lcp = 0;
    try {
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      lcp = lcpEntries.at(-1)?.startTime || 0;
    } catch {
      lcp = 0;
    }
    if (!lcp) {
      lcp = await new Promise((resolve) => {
        let latest = 0;
        const po = new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) latest = last.startTime;
        });
        try {
          po.observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          resolve(0);
          return;
        }
        setTimeout(() => {
          po.disconnect();
          resolve(latest);
        }, 400);
      });
    }
    return {
      ttfbMs: nav ? nav.responseStart : 0,
      dclMs: nav ? nav.domContentLoadedEventEnd : 0,
      loadMs: nav ? nav.loadEventEnd : 0,
      fcpMs: paint["first-contentful-paint"] || 0,
      lcpMs: lcp,
      transferKb: nav ? Math.round((nav.transferSize || 0) / 1024) : 0,
      encodedKb: nav ? Math.round((nav.encodedBodySize || 0) / 1024) : 0,
      resourceCount: resources.length,
      resourceKb: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
    };
  });
}

async function measure(page, path, label) {
  const started = Date.now();
  const response = await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(500);
  const nav = await collectNav(page);
  const wallMs = Date.now() - started;
  return {
    id: label,
    path,
    status: response?.status() ?? 0,
    wallMs,
    ...nav,
    ttfbMs: round(nav.ttfbMs),
    dclMs: round(nav.dclMs),
    loadMs: round(nav.loadMs),
    fcpMs: round(nav.fcpMs),
    lcpMs: round(nav.lcpMs),
  };
}

function verdict(row, extra = {}) {
  const fails = [];
  if (row.status && row.status >= 400) fails.push(`HTTP ${row.status}`);
  if (extra.loginPost) {
    if (row.ttfbMs > BUDGET.loginPostMs) fails.push(`login TTFB ${row.ttfbMs}ms > ${BUDGET.loginPostMs}ms`);
  } else {
    if (row.ttfbMs > BUDGET.ttfbMs) fails.push(`TTFB ${row.ttfbMs}ms > ${BUDGET.ttfbMs}ms`);
    if (row.loadMs > BUDGET.loadMs) fails.push(`load ${row.loadMs}ms > ${BUDGET.loadMs}ms`);
    if (row.lcpMs > BUDGET.lcpMs) fails.push(`LCP ${row.lcpMs}ms > ${BUDGET.lcpMs}ms`);
  }
  return fails;
}

const samples = [];
const results = [];

function record(id, title, row, extra = {}) {
  const fails = verdict(row, extra);
  const item = {
    id,
    title,
    result: fails.length ? "fail" : "pass",
    note: fails.join(" · "),
    ...row,
  };
  results.push(item);
  samples.push(row);
  const mark = item.result === "pass" ? "PASS" : "FAIL";
  console.log(
    `${mark} ${id}  ${title}  ttfb=${row.ttfbMs}ms  fcp=${row.fcpMs}ms  lcp=${row.lcpMs}ms  load=${row.loadMs}ms  xfer=${row.transferKb}KB/${row.resourceKb}KB  n=${row.resourceCount}`,
  );
  if (fails.length) console.error(`     ${item.note}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const client = await context.newCDPSession(page);

try {
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });

  const loginGet = await measure(page, "/login", "login-cold");
  await page.screenshot({ path: join(outDir, "login.png"), fullPage: true });
  record("PERF-01", "GET /login (cold)", loginGet);

  const loginStarted = Date.now();
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/auth/login") && res.request().method() === "POST", {
      timeout: 30000,
    }),
    page.getByRole("button", { name: "Đăng nhập" }).click(),
  ]);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("load", { timeout: 45000 }).catch(() => {});
  const loginPostMs = Date.now() - loginStarted;
  const loginNav = await collectNav(page);
  const loginRow = {
    id: "login-post",
    path: "/api/auth/login",
    status: loginResponse.status(),
    wallMs: loginPostMs,
    ttfbMs: loginPostMs,
    dclMs: round(loginNav.dclMs),
    loadMs: round(loginNav.loadMs),
    fcpMs: round(loginNav.fcpMs),
    lcpMs: round(loginNav.lcpMs),
    transferKb: loginNav.transferKb,
    encodedKb: loginNav.encodedKb,
    resourceCount: loginNav.resourceCount,
    resourceKb: loginNav.resourceKb,
  };
  record("PERF-02", `POST /api/auth/login (${user})`, loginRow, { loginPost: true });

  for (const route of ROUTES.filter((r) => r.auth)) {
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    const cold = await measure(page, route.path, `${route.id}-cold`);
    await page.screenshot({ path: join(outDir, `${route.id}.png`), fullPage: true }).catch(() => {});
    record(`PERF-${route.id}-cold`, `GET ${route.path} cold`, cold);

    await client.send("Network.setCacheDisabled", { cacheDisabled: false });
    const warm = await measure(page, route.path, `${route.id}-warm`);
    record(`PERF-${route.id}-warm`, `GET ${route.path} warm`, warm);
  }
} finally {
  await browser.close();
}

const htmlSamples = samples.filter((s) => s.path !== "/api/auth/login");
const summary = {
  ttfbP50: percentile(htmlSamples.map((s) => s.ttfbMs), 50),
  ttfbP95: percentile(htmlSamples.map((s) => s.ttfbMs), 95),
  lcpP50: percentile(htmlSamples.map((s) => s.lcpMs), 50),
  lcpP95: percentile(htmlSamples.map((s) => s.lcpMs), 95),
  loadP50: percentile(htmlSamples.map((s) => s.loadMs), 50),
  loadP95: percentile(htmlSamples.map((s) => s.loadMs), 95),
};

const pass = results.filter((r) => r.result === "pass").length;
const fail = results.filter((r) => r.result === "fail").length;
const ran = pass + fail;
const rate = ran ? Math.round((pass / ran) * 100) : 0;
const manifest = {
  runId,
  date: new Date().toISOString(),
  commit,
  env: base,
  user,
  budget: BUDGET,
  summary,
  pass,
  fail,
  total: results.length,
  passRate: `${rate}%`,
  results,
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nRUN ${runId}  commit ${commit}  env ${base}`);
console.log(
  `HTML TTFB p50=${summary.ttfbP50}ms p95=${summary.ttfbP95}ms  LCP p50=${summary.lcpP50}ms p95=${summary.lcpP95}ms  load p50=${summary.loadP50}ms p95=${summary.loadP95}ms`,
);
console.log(`PASS ${pass}  FAIL ${fail}  ${rate}%`);
console.log(`EVIDENCE ${outDir.replace(`${root}/`, "")}`);
if (fail) process.exitCode = 1;
