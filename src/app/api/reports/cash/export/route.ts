import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cashFlowXlsx } from "@/lib/cash-flow-xlsx";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { cashFlowReport, parsePeriodQuery } from "@/lib/sales-report";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user.role, "viewSalesRevenue")) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });
  const date = new URL(request.url).searchParams.get("date") || undefined;
  const { window } = parsePeriodQuery("month", date);
  const report = cashFlowReport(await listBookings(), window.from, window.to);
  const bytes = cashFlowXlsx(report);
  const filename = `dong-tien-${window.from.slice(0, 7)}.xlsx`;
  return new NextResponse(new Blob([bytes]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
