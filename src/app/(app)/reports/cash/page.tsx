import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat, TabChip } from "@/components/ui";
import { ReportTabs } from "@/components/report-tabs";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL } from "@/lib/constants";
import { formatDateNumeric, formatPeriodLabel } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { bookingDisplayCode, formatVnd } from "@/lib/sales";
import { CASH_FLOW_KIND_LABEL, cashFlowReport, parsePeriodQuery, type ReportGrain } from "@/lib/sales-report";
import type { SaleSource } from "@/lib/types";

const GRAINS: { id: ReportGrain; label: string }[] = [
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "year", label: "Năm" },
];

function hrefFor(grain: ReportGrain, date: string) {
  return `/reports/cash?grain=${grain}&date=${date}`;
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewSalesRevenue")) redirect("/more");
  const { grain: rawGrain, date: rawDate } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const year = window.from.slice(0, 4);
  const bookings = await listBookings();
  const report = cashFlowReport(bookings, window.from, window.to);
  const monthChips = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return { date: `${year}-${month}-01`, label: String(i + 1) };
  });
  const totals = report.totals;

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Báo cáo dòng tiền</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">
          Theo ngày nhận trong kỳ, gồm booking chưa đến ngày nhận. Giá booking đã gồm VAT 8%; VAT tách riêng để khấu trừ sau. Tiền mặt, CK cá nhân và CK công ty là tiền đã thu. OTA công nợ thành phải thu sau hoa hồng. OTA thu tại khách sạn giữ tiền đã thu và ghi hoa hồng vào phải trả.
        </p>
      </div>

      <ReportTabs active="cash" showSales showWork={can(user.role, "viewReports")} />

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {GRAINS.map((item) => (
          <TabChip key={item.id} href={hrefFor(item.id, window.from)} active={grain === item.id}>
            {item.label}
          </TabChip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={hrefFor(grain, window.prev)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
          ‹
        </Link>
        <p className="text-center font-bold">{formatPeriodLabel(grain, window.from)}</p>
        <Link href={hrefFor(grain, window.next)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
          ›
        </Link>
      </div>

      {grain === "month" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {monthChips.map((item) => (
            <TabChip key={item.date} href={hrefFor("month", item.date)} active={window.from === item.date}>
              {item.label}
            </TabChip>
          ))}
        </div>
      ) : null}
      {grain === "quarter" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {[1, 2, 3, 4].map((q) => {
            const qDate = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
            return (
              <TabChip key={q} href={hrefFor("quarter", qDate)} active={window.from === qDate}>
                Quý {q}
              </TabChip>
            );
          })}
        </div>
      ) : null}

      <div className="revenue-stats">
        <Stat label="Tổng gồm VAT" value={formatVnd(totals.gross)} />
        <Stat label="Chưa VAT" value={formatVnd(totals.net)} />
        <Stat label="VAT 8%" value={formatVnd(totals.vat)} />
        <Stat label="Tiền mặt" value={formatVnd(totals.cash)} />
        <Stat label="CK cá nhân" value={formatVnd(totals.transfer)} />
        <Stat label="CK công ty" value={formatVnd(totals.company)} />
        <Stat label="Phải thu OTA" value={formatVnd(totals.receivable)} tone="text-[#c47b12]" />
        <Stat label="Phải trả hoa hồng" value={formatVnd(totals.payable)} tone="text-[#c47b12]" />
        <Stat label="Khách còn nợ" value={formatVnd(totals.guestDue)} />
      </div>

      <p className="text-xs text-[#5c6665]">
        {totals.count
          ? `${totals.count} booking nhận trong kỳ, ${totals.recognizedCount} đã đến ngày ghi nhận.`
          : "Chưa có booking nhận trong kỳ. Đổi tháng / quý / năm."}
      </p>

      <Card className="!p-0">
        <div className="px-4 pt-4">
          <h2 className="mb-2 font-bold">Chi tiết booking ({totals.count})</h2>
        </div>
        {report.rows.length ? (
          <div className="cash-flow-scroll">
            <table className="cash-flow-table">
              <thead>
                <tr>
                  <th>Tên khách</th>
                  <th>Mã</th>
                  <th>Nguồn</th>
                  <th>Hình thức</th>
                  <th>Ngày tạo</th>
                  <th>Ngày ghi nhận</th>
                  <th>Ghi nhận</th>
                  <th className="is-num">Tổng gồm VAT</th>
                  <th className="is-num">Chưa VAT</th>
                  <th className="is-num">VAT</th>
                  <th className="is-num">Tiền mặt</th>
                  <th className="is-num">CK cá nhân</th>
                  <th className="is-num">CK công ty</th>
                  <th className="is-num">Phải thu OTA</th>
                  <th className="is-num">Phải trả hoa hồng</th>
                  <th className="is-num">Khách còn nợ</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map(({ booking, flow }) => (
                  <tr key={booking.id}>
                    <td>
                      <Link href={`/sales/bookings/${booking.id}`} className="font-bold text-teal">
                        {booking.guestName}
                      </Link>
                    </td>
                    <td>{bookingDisplayCode(booking)}</td>
                    <td>{SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source}</td>
                    <td>{CASH_FLOW_KIND_LABEL[flow.kind]}</td>
                    <td>{formatDateNumeric(booking.createdAt)}</td>
                    <td>{formatDateNumeric(booking.checkIn)}</td>
                    <td>
                      <Chip tone={flow.recognized ? "ok" : "gold"}>{flow.recognized ? "Đã ghi nhận" : "Chưa ghi nhận"}</Chip>
                    </td>
                    <td className="is-num">{formatVnd(flow.gross)}</td>
                    <td className="is-num">{formatVnd(flow.net)}</td>
                    <td className="is-num">{formatVnd(flow.vat)}</td>
                    <td className="is-num">{formatVnd(flow.cash)}</td>
                    <td className="is-num">{formatVnd(flow.transfer)}</td>
                    <td className="is-num">{formatVnd(flow.company)}</td>
                    <td className="is-num">{formatVnd(flow.receivable)}</td>
                    <td className="is-num">{formatVnd(flow.payable)}</td>
                    <td className="is-num">{formatVnd(flow.guestDue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Tổng</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="is-num">{formatVnd(totals.gross)}</td>
                  <td className="is-num">{formatVnd(totals.net)}</td>
                  <td className="is-num">{formatVnd(totals.vat)}</td>
                  <td className="is-num">{formatVnd(totals.cash)}</td>
                  <td className="is-num">{formatVnd(totals.transfer)}</td>
                  <td className="is-num">{formatVnd(totals.company)}</td>
                  <td className="is-num">{formatVnd(totals.receivable)}</td>
                  <td className="is-num">{formatVnd(totals.payable)}</td>
                  <td className="is-num">{formatVnd(totals.guestDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <Empty title="Không có booking nhận trong kỳ" text="Đổi tháng / quý / năm." />
          </div>
        )}
      </Card>
    </main>
  );
}
