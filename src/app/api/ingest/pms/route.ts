import { NextResponse } from "next/server";
import { ingestAuthorized, ingestPmsBookings, ingestSecret, type IngestBooking } from "@/lib/ingest";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  if (!ingestSecret() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Chưa cấu hình INGEST_SECRET" }, { status: 503 });
  }
  if (!ingestAuthorized(request)) return unauthorized();
  return NextResponse.json({
    ok: true,
    endpoint: "/api/ingest/pms",
    accepts: "POST JSON { bookings: IngestBooking[] }",
  });
}

export async function POST(request: Request) {
  if (!ingestSecret() && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Chưa cấu hình INGEST_SECRET" }, { status: 503 });
  }
  if (!ingestAuthorized(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON không hợp lệ" }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const list = Array.isArray(record.bookings)
    ? record.bookings
    : Array.isArray(record.stays)
      ? record.stays
      : Array.isArray(body)
        ? body
        : [];
  if (!list.length) {
    return NextResponse.json({ ok: false, error: "Thiếu bookings[]" }, { status: 400 });
  }

  const bookings = list.filter((row) => row && typeof row === "object").slice(0, 200) as IngestBooking[];
  const results = await ingestPmsBookings(bookings);
  const errors = results.filter((row) => row.error);
  return NextResponse.json({
    ok: errors.length === 0,
    source: record.source || "ezcloud-agent",
    pulledAt: record.pulledAt || new Date().toISOString(),
    count: results.length,
    created: results.filter((row) => row.stay === "created" || row.sale === "created").length,
    updated: results.filter((row) => row.stay === "updated" || row.sale === "updated").length,
    errors,
    results,
  });
}
