import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/password-reset";
import { requestIp } from "@/lib/api-rate-limit";
import { RATE_LIMIT_MESSAGE, takeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const limited = takeRateLimit(`reset:ip:${requestIp(request)}`, 10, 60 * 60_000);
  if (!limited.ok) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("error", RATE_LIMIT_MESSAGE);
    return NextResponse.redirect(url, 303);
  }
  const error = await resetPasswordWithToken(
    token,
    String(form.get("password") || ""),
    String(form.get("confirmation") || ""),
  );
  if (error) {
    const url = new URL("/reset-password", request.url);
    url.searchParams.set("token", token);
    url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.redirect(new URL("/login?reset=1", request.url), 303);
}
