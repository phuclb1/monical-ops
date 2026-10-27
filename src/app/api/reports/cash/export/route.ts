import { NextResponse } from "next/server";
import { tooManyRequests } from "@/lib/api-rate-limit";
import { takeRateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";
import { cashFlowXlsx } from "@/lib/cash-flow-xlsx";
import { can } from "@/lib/permissions";
import { listCashPeriodBookings } from "@/lib/repos";
import { actualCashFlowReport, cashFlowReport, filterActualCashFlow, filterCashFlowReport, parseIsoDate, parsePeriodQuery } from "@/lib/sales-report";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user.role, "viewSalesRevenue")) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const limited = takeRateLimit(`cash-export:${user.id}`, 6, 60_000);
  if (!limited.ok) return tooManyRequests(limited, "Đang xuất quá nhanh. Hãy đợi một lát.");
  const params = new URL(request.url).searchParams;
  const { grain, window } = parsePeriodQuery(params.get("grain") || undefined, params.get("date") || undefined);
  const filter = {
    q: params.get("q") || "",
    arrive: parseIsoDate(params.get("arrive")),
    depart: parseIsoDate(params.get("depart")),
  };
  const bookings = await listCashPeriodBookings(window.from, window.to);
  const report = filterCashFlowReport(cashFlowReport(bookings, window.from, window.to), filter);
  const actual = filterActualCashFlow(actualCashFlowReport(bookings, window.from, window.to), filter);
  const bytes = cashFlowXlsx(report, actual);
  const stamp = grain === "year" ? window.from.slice(0, 4) : grain === "quarter" ? `${window.from.slice(0, 4)}-q${Math.ceil(Number(window.from.slice(5, 7)) / 3)}` : window.from.slice(0, 7);
  const filename = `dong-tien-${stamp}.xlsx`;
  return new NextResponse(new Blob([bytes]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
