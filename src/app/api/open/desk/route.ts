import { NextResponse } from "next/server";
import { limitRequest } from "@/lib/api-rate-limit";
import { addMonthsVN, startOfMonthVN, todayVN } from "@/lib/datetime";
import { buildDeskBrief, type DeskBooking } from "@/lib/desk-brief";
import { openApiAuthorized, resolveOpenApiSecret } from "@/lib/open-api";
import { listBookingsByCheckIn, listBookingsOnStayDate, listInhouseBookings, salesBoard } from "@/lib/repos/sales";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function unavailable() {
  return NextResponse.json({ ok: false, error: "Chưa tạo token Open API trong Cài đặt" }, { status: 503 });
}

function toBooking(row: {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  pmsCode?: string | null;
  source?: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  total: number;
  due: number;
  deposit?: number;
  roomLabel?: string;
  rooms?: { status?: string; room?: { number?: string | null } | null }[];
  otaPaymentMode?: string | null;
  otaCommissionPercent?: number | null;
  otaCommissionKind?: string | null;
  otaCommissionValue?: number | null;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
}): DeskBooking {
  return {
    id: row.id,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    pmsCode: row.pmsCode,
    source: row.source,
    status: row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    total: row.total,
    due: row.due,
    deposit: row.deposit,
    roomLabel: row.roomLabel,
    rooms: row.rooms,
    otaPaymentMode: row.otaPaymentMode,
    otaCommissionPercent: row.otaCommissionPercent,
    otaCommissionKind: row.otaCommissionKind,
    otaCommissionValue: row.otaCommissionValue,
    roomTotal: row.roomTotal,
    extrasTotal: row.extrasTotal,
    cashPaid: row.cashPaid,
    transferPaid: row.transferPaid,
    companyPaid: row.companyPaid,
  };
}

export async function GET(request: Request) {
  const limited = limitRequest(request, "open-desk", 60, 60_000);
  if (limited) return limited;
  if (!(await resolveOpenApiSecret()) && process.env.NODE_ENV === "production") return unavailable();
  if (!(await openApiAuthorized(request))) return unauthorized();

  const url = new URL(request.url);
  const today = todayVN();
  const date = (url.searchParams.get("date") || today).trim();
  if (!DATE.test(date)) {
    return NextResponse.json({ ok: false, error: "Ngày không hợp lệ. Dùng date=YYYY-MM-DD" }, { status: 400 });
  }
  const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const monthFrom = startOfMonthVN(date);

  try {
    const [onDate, inhouse, month, board] = await Promise.all([
      listBookingsOnStayDate(date),
      listInhouseBookings(),
      listBookingsByCheckIn(monthFrom, addMonthsVN(monthFrom, 1)),
      salesBoard(date),
    ]);
    const brief = buildDeskBrief({
      today,
      date,
      onDate: onDate.map(toBooking),
      inhouse: inhouse.map(toBooking),
      month: month.map(toBooking),
      vacantRooms: board.cells.filter((cell) => cell.kind === "vacant").map((cell) => cell.room.number),
      occupancy: {
        rooms: board.cells.length,
        vacant: board.vacant,
        reserved: board.reserved,
        inhouse: board.inhouse,
        ooo: board.ooo,
      },
      query,
    });
    return NextResponse.json({ ok: true, ...brief }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message || "Không đọc được số liệu" }, { status: 500 });
  }
}
