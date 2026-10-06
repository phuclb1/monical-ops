import { beginSepayNotice, markSepayNotified, sepaySecrets } from "@/lib/sepay-store";
import { isIncomingMoney, parseSepayPayload, verifySepayAuth } from "@/lib/sepay";
import { dispatchMoneyInZalo } from "@/lib/zalo-notify";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const secrets = await sepaySecrets();
  const auth = await verifySepayAuth({
    rawBody: raw,
    signature: request.headers.get("x-sepay-signature"),
    timestamp: request.headers.get("x-sepay-timestamp"),
    authorization: request.headers.get("authorization"),
    secret: secrets.secret,
    apiKey: secrets.apiKey,
    production: process.env.NODE_ENV === "production",
  });
  if (!auth.ok) return sepayJson({ success: false, message: auth.message }, auth.status);

  const parsed = parseSepayPayload(raw, request.headers.get("content-type") || "");
  if (!parsed.ok) return sepayJson({ success: false, message: parsed.message }, 400);
  if (!isIncomingMoney(parsed.tx)) return sepayJson({ success: true });

  let state: Awaited<ReturnType<typeof beginSepayNotice>>;
  try {
    state = await beginSepayNotice(parsed.tx);
  } catch (error) {
    console.error("sepay claim", error);
    return sepayJson({ success: false, message: "Không ghi được giao dịch" }, 500);
  }
  if (state === "sent") return sepayJson({ success: true });
  if (state === "inflight") return sepayJson({ success: false, message: "Đang xử lý" }, 500);

  try {
    const result = await dispatchMoneyInZalo(parsed.tx);
    if (result.reason === "no-group") return sepayJson({ success: false, message: "Chưa chọn nhóm kế toán" }, 500);
    await markSepayNotified(parsed.tx.id);
    return sepayJson({ success: true });
  } catch (error) {
    console.error("sepay zalo", error);
    return sepayJson({ success: false, message: "Không gửi được tin Zalo" }, 500);
  }
}

function sepayJson(body: { success: boolean; message?: string }, status = 200) {
  return Response.json(body, { status });
}
