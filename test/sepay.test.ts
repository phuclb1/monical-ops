import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { isIncomingMoney, parseSepayPayload, sepayClaimDecision, sepayWebhookUrl, verifySepayAuth } from "../src/lib/sepay";
import { moneyInZaloVars, renderZaloTemplate } from "../src/lib/zalo-templates";

const sample = {
  id: 92704,
  gateway: "Vietcombank",
  transactionDate: "2024-07-02 11:08:33",
  accountNumber: "1017588888",
  subAccount: "",
  code: null,
  content: "NGUYEN VAN A chuyen tien",
  transferType: "in",
  description: "NGUYEN VAN A chuyen tien",
  transferAmount: 10000,
  accumulated: 105010000,
  referenceCode: "FT24012345678",
};

test("payload tiền vào đọc đủ trường và bỏ tiền ra", () => {
  const raw = JSON.stringify(sample);
  const parsed = parseSepayPayload(raw, "application/json");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.tx.id, "92704");
  assert.equal(parsed.tx.code, "");
  assert.equal(isIncomingMoney(parsed.tx), true);
  assert.equal(isIncomingMoney({ ...parsed.tx, transferType: "out" }), false);
  assert.equal(isIncomingMoney({ ...parsed.tx, transferAmount: 0 }), false);

  const outgoing = parseSepayPayload(JSON.stringify({ ...sample, transferType: "out" }));
  assert.equal(outgoing.ok, true);
  if (outgoing.ok) assert.equal(isIncomingMoney(outgoing.tx), false);

  const trial = parseSepayPayload(JSON.stringify({ ...sample, id: 0 }));
  assert.equal(trial.ok, true);
  if (trial.ok) assert.equal(trial.tx.id, "0");
});

test("tin kế toán điền số tiền, ngân hàng và giờ Việt Nam", () => {
  const parsed = parseSepayPayload(JSON.stringify(sample));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const text = renderZaloTemplate(
    "Có tiền vào tài khoản\nNgân hàng: {{nganHang}}\nSố tiền: {{soTien}}\nLúc: {{luc}}\nSố dư: {{soDu}}",
    moneyInZaloVars({
      gateway: parsed.tx.gateway,
      accountNumber: parsed.tx.accountNumber,
      subAccount: parsed.tx.subAccount,
      amount: parsed.tx.transferAmount,
      content: parsed.tx.content,
      description: parsed.tx.description,
      at: parsed.tx.transactionDate,
      balance: parsed.tx.accumulated,
      reference: parsed.tx.referenceCode,
      code: parsed.tx.code,
    }),
  );
  assert.match(text, /Vietcombank/);
  assert.match(text, /10\.000₫/);
  assert.match(text, /02\/07\/2024 11:08/);
  assert.match(text, /105\.010\.000₫/);
});

test("chữ ký HMAC đúng raw body và API key", async () => {
  const raw = JSON.stringify(sample);
  const now = 1_720_000_000_000;
  const stamp = String(Math.floor(now / 1000));
  const signature = `sha256=${createHmac("sha256", "top-secret").update(`${stamp}.${raw}`).digest("hex")}`;
  const signed = await verifySepayAuth({
    rawBody: raw,
    signature,
    timestamp: stamp,
    authorization: null,
    secret: "top-secret",
    apiKey: "",
    now,
    production: true,
  });
  assert.deepEqual(signed, { ok: true });

  const tampered = await verifySepayAuth({
    rawBody: raw.replace("10000", "99999"),
    signature,
    timestamp: stamp,
    authorization: null,
    secret: "top-secret",
    apiKey: "",
    now,
    production: true,
  });
  assert.equal(tampered.ok, false);

  const expired = await verifySepayAuth({
    rawBody: raw,
    signature,
    timestamp: stamp,
    authorization: null,
    secret: "top-secret",
    apiKey: "",
    now: now + 301_000,
    production: true,
  });
  assert.equal(expired.ok, false);

  const keyed = await verifySepayAuth({
    rawBody: raw,
    signature: null,
    timestamp: null,
    authorization: "Apikey hotel-key",
    secret: "",
    apiKey: "hotel-key",
    production: true,
  });
  assert.deepEqual(keyed, { ok: true });

  const open = await verifySepayAuth({
    rawBody: raw,
    signature: null,
    timestamp: null,
    authorization: null,
    secret: "",
    apiKey: "",
    production: true,
  });
  assert.equal(open.ok, false);
  if (!open.ok) assert.equal(open.status, 503);
});

test("giao dịch đang gửi thì chưa nhận trùng, đã gửi thì bỏ qua", () => {
  const now = Date.parse("2026-10-05T07:00:00.000Z");
  assert.equal(sepayClaimDecision(null, now), "new");
  assert.equal(sepayClaimDecision({ notified: true, receivedAt: "2026-10-05T06:59:00.000Z" }, now), "sent");
  assert.equal(sepayClaimDecision({ notified: false, receivedAt: "2026-10-05T06:59:40.000Z" }, now), "inflight");
  assert.equal(sepayClaimDecision({ notified: false, receivedAt: "2026-10-05T06:58:00.000Z" }, now), "retry");
});

test("url webhook là địa chỉ nền tảng", () => {
  assert.equal(sepayWebhookUrl(), "https://platform.monicalhoteldalat.com/api/webhooks/sepay");
  assert.equal(sepayWebhookUrl("http://localhost:3000"), "https://platform.monicalhoteldalat.com/api/webhooks/sepay");
  assert.equal(
    sepayWebhookUrl("https://ops-monical.phuclb1.workers.dev"),
    "https://platform.monicalhoteldalat.com/api/webhooks/sepay",
  );
  assert.equal(
    sepayWebhookUrl("https://ops-staging.monicalhoteldalat.com"),
    "https://ops-staging.monicalhoteldalat.com/api/webhooks/sepay",
  );
});

test("webhook sepay không đòi đăng nhập", async () => {
  const response = await proxy(new NextRequest("https://platform.monicalhoteldalat.com/api/webhooks/sepay", { method: "POST" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
});
