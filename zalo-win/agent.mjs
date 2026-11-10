import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo, LoginQRCallbackEventType, ThreadType } from "zca-js";

const root = dirname(fileURLToPath(import.meta.url));
const logPath = join(root, "agent.log");
const config = loadConfig();
const opsUrl = config.opsUrl;
const token = config.token;
const pollMs = config.pollMs;
const ZALO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

if (!opsUrl || !token) {
  log("Thiếu OPS_URL/ZALO_AGENT_TOKEN (env) hoặc opsUrl/token trong config.json");
  process.exit(1);
}

function loadConfig() {
  let file = {};
  try {
    file = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
  } catch {
    // config.json optional when env is set
  }
  return {
    opsUrl: String(process.env.OPS_URL || file.opsUrl || "").replace(/\/$/, ""),
    token: String(process.env.ZALO_AGENT_TOKEN || process.env.TOKEN || file.token || ""),
    pollMs: Math.max(2000, Number(process.env.POLL_MS || file.pollMs || 4000)),
  };
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

const headers = {
  authorization: `Bearer ${token}`,
  "user-agent": "MonicalZaloAgent/1.0",
};

async function pull() {
  const response = await fetch(`${opsUrl}/api/zalo/agent`, { headers });
  if (!response.ok) throw new Error(`Không lấy được hàng gửi (${response.status})`);
  return response.json();
}

async function reportSend(job, ok, error, credentials) {
  await fetch(`${opsUrl}/api/zalo/agent`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      id: job.id,
      claimId: job.claimId,
      ok,
      error,
      credentials,
    }),
  });
}

async function reportEvent(job, event) {
  await fetch(`${opsUrl}/api/zalo/agent`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      type: "job_event",
      id: job.id,
      claimId: job.claimId,
      event,
    }),
  });
}

async function reportJob(job, ok, result, error, credentials) {
  await fetch(`${opsUrl}/api/zalo/agent`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      type: "job_done",
      kind: job.kind,
      id: job.id,
      claimId: job.claimId,
      ok,
      result,
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

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
}

function phonesMatch(left, right) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return Boolean(a && b && a === b);
}

async function credentialsFrom(apiInstance, device) {
  const jar = await apiInstance.getCookie().serialize();
  if (!jar.cookies?.length) throw new Error("Zalo không trả cookie để lưu phiên.");
  return {
    imei: device.imei,
    userAgent: device.userAgent,
    language: "vi",
    cookies: jar.cookies,
  };
}

async function readProfile(apiInstance) {
  try {
    const info = await apiInstance.fetchAccountInfo();
    return info.profile || {};
  } catch {
    return {};
  }
}

async function listGroups(credentials) {
  const current = await session(credentials);
  const all = await current.getAllGroups();
  const ids = Object.keys(all.gridVerMap || {});
  const groups = [];
  for (let index = 0; index < ids.length; index += 40) {
    const info = await current.getGroupInfo(ids.slice(index, index + 40));
    for (const [id, group] of Object.entries(info.gridInfoMap || {})) {
      groups.push({ id, name: group.name || "Nhóm không tên", members: group.totalMember || 0 });
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return { groups, credentials: await freshCookies(credentials) };
}

async function loginQr(job) {
  const phone = normalizePhone(job.payload?.phone || "");
  const zalo = new Zalo({ logging: false, checkUpdate: false });
  let abort = null;
  let device = null;
  let scannedName = "";
  let retries = 0;
  const apiInstance = await zalo.loginQR({ userAgent: ZALO_UA, language: "vi" }, async (event) => {
    if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
      abort = event.actions.abort;
      await reportEvent(job, { status: "qr", image: event.data.image });
    } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
      scannedName = event.data.display_name || "";
      await reportEvent(job, { status: "scanned", name: scannedName });
    } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
      retries += 1;
      if (retries <= 2) {
        event.actions.retry();
      } else {
        await reportEvent(job, { status: "expired", message: "Mã QR hết hạn. Bấm kết nối lại." });
        event.actions.abort();
      }
    } else if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
      await reportEvent(job, { status: "declined", message: "Đã từ chối mã QR trên điện thoại." });
      event.actions.abort();
    } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
      device = { imei: event.data.imei, userAgent: event.data.userAgent };
    }
  });
  if (!apiInstance || !device) throw new Error("Không nhận được phiên Zalo sau khi quét mã.");
  const profile = await readProfile(apiInstance);
  const accountPhone = normalizePhone(profile.phoneNumber || "");
  if (accountPhone && phone && !phonesMatch(accountPhone, phone)) {
    abort?.();
    throw new Error(`Tài khoản vừa quét không khớp số ${phone}. Quét bằng đúng số đã lưu.`);
  }
  const credentials = await credentialsFrom(apiInstance, device);
  api = apiInstance;
  return {
    credentials,
    result: {
      phone,
      accountName: profile.displayName || scannedName || "",
      accountUid: profile.userId || "",
      accountPhone: accountPhone || phone,
    },
  };
}

async function handleCommands(commands, credentials) {
  let current = credentials;
  for (const job of commands) {
    try {
      if (job.kind === "login_qr") {
        const logged = await loginQr(job);
        current = logged.credentials;
        await reportJob(job, true, logged.result, "", logged.credentials);
        log(`Đã đăng nhập QR ${job.id}`);
      } else if (job.kind === "list_groups") {
        if (!current) {
          await reportJob(job, false, null, "Chưa có phiên Zalo", null);
          continue;
        }
        const listed = await listGroups(current);
        current = listed.credentials;
        await reportJob(job, true, { groups: listed.groups }, "", listed.credentials);
        log(`Đã tải nhóm ${job.id} (${listed.groups.length})`);
      } else {
        await reportJob(job, false, null, `Không hỗ trợ lệnh ${job.kind}`, null);
      }
    } catch (error) {
      api = null;
      const message = error instanceof Error ? error.message : "Không xử lý được lệnh";
      await reportJob(job, false, null, message, null);
      log(`Lỗi lệnh ${job.id}: ${message}`);
    }
  }
  return current;
}

async function tick() {
  const data = await pull();
  let credentials = data.credentials || null;
  if (data.commands?.length) {
    credentials = await handleCommands(data.commands, credentials);
  }
  if (!data.jobs?.length) return;
  if (!credentials) {
    for (const job of data.jobs) await reportSend(job, false, "Chưa có phiên Zalo", null);
    return;
  }
  for (const job of data.jobs) {
    try {
      credentials = await sendJob(credentials, job);
      await reportSend(job, true, "", credentials);
      log(`Đã gửi ${job.id}`);
    } catch (error) {
      api = null;
      const message = error instanceof Error ? error.message : "Không gửi được";
      await reportSend(job, false, message, null);
      log(`Lỗi ${job.id}: ${message}`);
    }
  }
}

log(`Máy gửi Zalo đã chạy → ${opsUrl}`);
while (true) {
  try {
    await tick();
  } catch (error) {
    api = null;
    log(error instanceof Error ? error.message : "Lỗi vòng gửi");
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
