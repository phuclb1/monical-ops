import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";
import { requestIp } from "@/lib/api-rate-limit";
import { takeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const ip = requestIp(request);
  const ipLimit = takeRateLimit(`forgot:ip:${ip}`, 10, 60 * 60_000);
  const emailLimit = takeRateLimit(`forgot:email:${email}`, 3, 60 * 60_000);
  if (!ipLimit.ok || !emailLimit.ok) {
    return NextResponse.redirect(new URL("/forgot-password?error=rate", request.url), 303);
  }
  await requestPasswordReset(email);
  return NextResponse.redirect(new URL("/forgot-password?sent=1", request.url), 303);
}
