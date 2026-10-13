import { NextResponse } from "next/server";
import { getOpenBooking, openApiAuthorized, resolveOpenApiSecret } from "@/lib/open-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await resolveOpenApiSecret()) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Chưa tạo token Open API trong Cài đặt" }, { status: 503 });
  }
  if (!(await openApiAuthorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const booking = await getOpenBooking(id);
  if (!booking) return NextResponse.json({ ok: false, error: "Không tìm thấy booking" }, { status: 404 });
  return NextResponse.json({ ok: true, booking });
}
