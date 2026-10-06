import { publicPlatformOrigin } from "@/lib/site";

export const SEPAY_INFLIGHT_MS = 50_000;

export function sepayWebhookUrl(origin?: string | null) {
  return `${publicPlatformOrigin(origin)}/api/webhooks/sepay`;
}

export type SepayTransaction = {
  id: string;
  gateway: string;
  accountNumber: string;
  subAccount: string;
  code: string;
  content: string;
  description: string;
  transferType: "in" | "out";
  transferAmount: number;
  accumulated: number;
  referenceCode: string;
  transactionDate: string;
};

type AuthOk = { ok: true };
type AuthFail = { ok: false; status: number; message: string };

export function parseSepayPayload(raw: string, contentType = ""): { ok: true; tx: SepayTransaction } | { ok: false; message: string } {
  const record = readRecord(raw, contentType);
  if (!record) return { ok: false, message: "Payload không hợp lệ" };
  const id = transactionId(record.id);
  if (!id) return { ok: false, message: "Thiếu mã giao dịch" };
  const transferType = String(record.transferType || "").trim().toLowerCase();
  if (transferType !== "in" && transferType !== "out") return { ok: false, message: "Thiếu loại giao dịch" };
  const amount = wholeAmount(record.transferAmount);
  if (amount === null) return { ok: false, message: "Số tiền không hợp lệ" };
  return {
    ok: true,
    tx: {
      id,
      gateway: text(record.gateway),
      transactionDate: text(record.transactionDate),
      accountNumber: text(record.accountNumber),
      subAccount: text(record.subAccount),
      code: text(record.code),
      content: text(record.content),
      transferType,
      description: text(record.description),
      transferAmount: amount,
      accumulated: wholeAmount(record.accumulated) ?? 0,
      referenceCode: text(record.referenceCode),
    },
  };
}

export function isIncomingMoney(tx: Pick<SepayTransaction, "transferType" | "transferAmount">) {
  return tx.transferType === "in" && tx.transferAmount > 0;
}

export function sepayClaimDecision(existing: { notified: boolean; receivedAt: string } | null, now = Date.now()) {
  if (!existing) return "new" as const;
  if (existing.notified) return "sent" as const;
  const received = Date.parse(existing.receivedAt);
  if (Number.isFinite(received) && now - received < SEPAY_INFLIGHT_MS) return "inflight" as const;
  return "retry" as const;
}

export async function verifySepayAuth(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  authorization: string | null;
  secret: string;
  apiKey: string;
  now?: number;
  production: boolean;
}): Promise<AuthOk | AuthFail> {
  const secret = input.secret.trim();
  const apiKey = input.apiKey.trim();
  if (!secret && !apiKey) {
    if (input.production) return { ok: false, status: 503, message: "Chưa cấu hình SePay" };
    return { ok: true };
  }
  const signature = input.signature?.trim() || "";
  if (signature || (secret && !apiKey)) {
    if (!secret) return { ok: false, status: 401, message: "Sai chữ ký" };
    return verifyHmac(secret, input.rawBody, signature, input.timestamp, input.now ?? Date.now());
  }
  return verifyApiKey(apiKey, input.authorization);
}

function readRecord(raw: string, contentType: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (contentType.includes("application/x-www-form-urlencoded") || (!trimmed.startsWith("{") && trimmed.includes("="))) {
    const params = new URLSearchParams(trimmed);
    return Object.fromEntries(params.entries());
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function transactionId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}

function wholeAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, 500);
}

async function verifyHmac(secret: string, rawBody: string, signature: string, timestamp: string | null, now: number): Promise<AuthOk | AuthFail> {
  const stamp = timestamp?.trim() || "";
  if (!/^\d+$/.test(stamp)) return { ok: false, status: 401, message: "Thiếu thời gian ký" };
  const seconds = Number(stamp);
  if (Math.abs(now / 1000 - seconds) > 300) return { ok: false, status: 401, message: "Chữ ký hết hạn" };
  const expected = `sha256=${await hmacHex(secret, `${stamp}.${rawBody}`)}`;
  if (!safeEqual(expected, signature.toLowerCase())) return { ok: false, status: 401, message: "Sai chữ ký" };
  return { ok: true };
}

function verifyApiKey(apiKey: string, authorization: string | null): AuthOk | AuthFail {
  const header = authorization?.trim() || "";
  const match = /^apikey\s+(\S+)$/i.exec(header);
  const given = match?.[1] || "";
  if (!given || !safeEqual(given, apiKey)) return { ok: false, status: 401, message: "Sai API key" };
  return { ok: true };
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
