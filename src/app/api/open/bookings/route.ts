import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/api-rate-limit";
import { createRoomSale } from "@/lib/repos/sales/create";
import {
  getOpenBooking,
  listOpenBookings,
  openApiActor,
  openApiAuthorized,
  openSaleInputFromDraft,
  parseOpenBookingCreate,
  resolveOpenApiSecret,
} from "@/lib/open-api";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function unavailable() {
  return NextResponse.json({ ok: false, error: "Chưa tạo token Open API trong Cài đặt" }, { status: 503 });
}

export async function GET(request: Request) {
  const limited = limitRequest(request, "open-api", 90, 60_000);
  if (limited) return limited;
  if (!(await resolveOpenApiSecret()) && process.env.NODE_ENV === "production") return unavailable();
  if (!(await openApiAuthorized(request))) return unauthorized();

  const url = new URL(request.url);
  const ref = (url.searchParams.get("id") || url.searchParams.get("pmsCode") || "").trim();
  if (ref) {
    const booking = await getOpenBooking(ref);
    if (!booking) return NextResponse.json({ ok: false, error: "Không tìm thấy booking" }, { status: 404 });
    return NextResponse.json({ ok: true, booking });
  }

  const polledAt = new Date().toISOString();
  const bookings = await listOpenBookings({
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    status: url.searchParams.get("status") || undefined,
    origin: url.searchParams.get("origin") || undefined,
    since: url.searchParams.get("since") || undefined,
    limit: Number(url.searchParams.get("limit") || 50),
  });
  return NextResponse.json({ ok: true, count: bookings.length, polledAt, bookings });
}

export async function POST(request: Request) {
  const limited = limitRequest(request, "open-api", 90, 60_000);
  if (limited) return limited;
  if (!(await resolveOpenApiSecret()) && process.env.NODE_ENV === "production") return unavailable();
  if (!(await openApiAuthorized(request))) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON không hợp lệ" }, { status: 400 });
  }

  try {
    const draft = parseOpenBookingCreate(body);
    const input = await openSaleInputFromDraft(draft);
    const created = await createRoomSale(openApiActor(), input);
    const booking = await getOpenBooking(created.bookingId);
    if (!booking) return NextResponse.json({ ok: false, error: "Tạo booking xong nhưng không đọc lại được" }, { status: 500 });
    return NextResponse.json({ ok: true, booking }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message || "Không tạo được booking" }, { status: 400 });
  }
}
