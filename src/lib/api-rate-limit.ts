import { NextResponse } from "next/server";
import { takeRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { clientIp } from "@/lib/reception-ip";

export function requestIp(request: Request) {
  return clientIp(request.headers) || "unknown";
}

export function tooManyRequests(result: Extract<RateLimitResult, { ok: false }>, message = "Quá nhiều yêu cầu. Hãy thử lại sau.") {
  const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  return NextResponse.json(
    { ok: false, error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export function limitRequest(request: Request, bucket: string, limit: number, windowMs: number) {
  const result = takeRateLimit(`${bucket}:${requestIp(request)}`, limit, windowMs);
  if (!result.ok) return tooManyRequests(result);
  return null;
}
