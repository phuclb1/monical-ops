import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/password-reset";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  const token = String(form.get("token") || "");
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
