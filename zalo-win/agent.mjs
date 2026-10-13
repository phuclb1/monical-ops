import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo, ThreadType } from "zca-js";

const root = dirname(fileURLToPath(import.meta.url));
const logPath = join(root, "agent.log");
const config = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
const opsUrl = String(config.opsUrl || "").replace(/\/$/, "");
const token = String(config.token || "");
const pollMs = Math.max(2000, Number(config.pollMs) || 4000);

if (!opsUrl || !token) {
  log("Thiếu opsUrl hoặc token trong config.json");
  process.exit(1);
}

let api = null;

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    if (statSync(logPath).size > 1_000_000) writeFileSync(logPath, "");
  } catch {
    // log file not created yet
  }
  appendFileSync(logPath, text);
}

async function pull() {
  const response = await fetch(`${opsUrl}/api/zalo/agent`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Không lấy được hàng gửi (${response.status})`);
  return response.json();
}

async function report(job, ok, error, credentials) {
  await fetch(`${opsUrl}/api/zalo/agent`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: job.id,
      claimId: job.claimId,
      ok,
      error,
      credentials,
    }),
  });
}

async function session(credentials) {
  if (api) return api;
  const zalo = new Zalo({ logging: false, checkUpdate: false });
  api = await zalo.login({
    imei: credentials.imei,
    userAgent: credentials.userAgent,
    language: credentials.language || "vi",
    cookie: credentials.cookies,
  });
  return api;
}

async function freshCookies(credentials) {
  const jar = await api.getCookie().serialize();
  if (!jar.cookies?.length) return credentials;
  return { ...credentials, cookies: jar.cookies };
}

async function sendJob(credentials, job) {
  const current = await session(credentials);
  await current.sendMessage(job.message, job.groupId, ThreadType.Group);
  return freshCookies(credentials);
}

async function tick() {
  const data = await pull();
  if (!data.jobs?.length) return;
  if (!data.credentials) {
    for (const job of data.jobs) await report(job, false, "Chưa có phiên Zalo", null);
    return;
  }
  let credentials = data.credentials;
  for (const job of data.jobs) {
    try {
      credentials = await sendJob(credentials, job);
      await report(job, true, "", credentials);
      log(`Đã gửi ${job.id}`);
    } catch (error) {
      api = null;
      const message = error instanceof Error ? error.message : "Không gửi được";
      await report(job, false, message, null);
      log(`Lỗi ${job.id}: ${message}`);
    }
  }
}

log("Máy gửi Zalo đã chạy");
while (true) {
  try {
    await tick();
  } catch (error) {
    api = null;
    log(error instanceof Error ? error.message : "Lỗi vòng gửi");
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
