import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/api-rate-limit";
import { openAvailability, parseOpenAvailabilityQuery } from "@/lib/open-availability";
import { listRoomBusyRanges, listRooms, listRoomTypes } from "@/lib/repos/rooms";

export const dynamic = "force-dynamic";

function withCors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  const limited = limitRequest(request, "open-availability", 60, 60_000);
  if (limited) return withCors(limited);

  try {
    const query = parseOpenAvailabilityQuery(new URL(request.url).searchParams);
    const [rooms, types, busy] = await Promise.all([listRooms(), listRoomTypes(), listRoomBusyRanges()]);
    const availability = openAvailability({ rooms, types, busy, ...query });
    return withCors(NextResponse.json({ ok: true, ...availability }));
  } catch (error) {
    return withCors(
      NextResponse.json({ ok: false, error: (error as Error).message || "Không kiểm tra được phòng trống" }, { status: 400 }),
    );
  }
}
