import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  await requestPasswordReset(String(form.get("email") || ""));
  return NextResponse.redirect(new URL("/forgot-password?sent=1", request.url), 303);
}
