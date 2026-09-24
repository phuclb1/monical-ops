import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat, TabChip } from "@/components/ui";
import { DonutChart, GroupedBarChart, HorizontalBarChart } from "@/components/report-charts";
import { ReportTabs } from "@/components/report-tabs";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric, formatPeriodLabel } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, isOtaDebt, isOtaSource, paidNote } from "@/lib/sales";
import { parsePeriodQuery, revenueTrend, roomRevenueReport, type ReportGrain } from "@/lib/sales-report";
import type { SaleSource, SaleStatus } from "@/lib/types";

const GRAINS: { id: ReportGrain; label: string }[] = [
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "year", label: "Năm" },
];

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

function hrefFor(grain: ReportGrain, date: string) {
  return `/reports/sales?grain=${grain}&date=${date}`;
}

export default async function SalesRevenuePage({
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
  const report = roomRevenueReport(bookings, window.from, window.to);
  const trend = revenueTrend(bookings, window.from, window.to, grain);
  const revenueBySource = new Map<string, number>();
  for (const booking of report.booked) {
    revenueBySource.set(booking.source, (revenueBySource.get(booking.source) || 0) + booking.total);
  }
  const sourceChart = [...revenueBySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([source, value]) => ({
      label: SALE_SOURCE_LABEL[source as SaleSource] || source,
      value,
    }));
  const monthChips = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return { date: `${year}-${month}-01`, label: String(i + 1) };
  });

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo doanh thu</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">
            Booking theo ngày nhận. Doanh thu OTA là tổng tiền phòng trước hoa hồng. Doanh thu ghi nhận khi khách check-in thành công.
          </p>
        </div>
      </div>

      <ReportTabs active="sales" showSales showWork={can(user.role, "viewReports")} />

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
        <Stat label="Doanh thu booking" value={formatVnd(report.booking.total)} />
        <Stat label="Đã đặt cọc" value={formatVnd(report.booking.deposit)} tone="text-[#1b7a4e]" />
        <Stat label="Phải thu" value={formatVnd(report.booking.due)} tone="text-[#c47b12]" />
        <Stat label="Doanh thu ghi nhận" value={formatVnd(report.recognizedMoney.total)} />
        <Stat label="Doanh thu OTA" value={formatVnd(report.booking.ota)} />
        <Stat label="CK công ty" value={formatVnd(report.booking.company)} />
        <Stat label="CK cá nhân" value={formatVnd(report.booking.transfer)} />
        <Stat label="Tiền mặt" value={formatVnd(report.booking.cash)} />
      </div>

      <section className="report-charts-grid" aria-label="Biểu đồ doanh thu">
        <GroupedBarChart
          title="Xu hướng doanh thu"
          subtitle="So sánh giá trị booking và doanh thu đã ghi nhận theo ngày hoặc tháng."
          items={trend.map((item) => ({
            label: item.label,
            value: item.booked,
            secondary: item.recognized,
          }))}
          primaryLabel="Booking"
          secondaryLabel="Đã ghi nhận"
          formatValue={formatVnd}
        />
        <DonutChart
          title="Tiến độ thu tiền"
          subtitle="Tỷ trọng số tiền đã thu và còn phải thu trong kỳ."
          items={[
            { label: "Đã thu", value: report.booking.deposit },
            { label: "Phải thu", value: report.booking.due },
          ]}
          centerLabel="tổng cần thu"
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Doanh thu theo nguồn booking"
          subtitle="6 nguồn có giá trị booking cao nhất."
          items={sourceChart}
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Cơ cấu tiền đã thu"
          subtitle="Phân bổ theo hình thức thanh toán."
          items={[
            { label: "CK cá nhân", value: report.booking.transfer },
            { label: "Tiền mặt", value: report.booking.cash },
            { label: "CK công ty", value: report.booking.company },
          ]}
          formatValue={formatVnd}
        />
      </section>

      <p className="text-xs text-[#5c6665]">
        {report.recognized.length
          ? `Ghi nhận ${report.recognized.length} booking check-in trong kỳ · OTA chưa trừ hoa hồng ${formatVnd(report.recognizedMoney.ota)} · CK công ty ${formatVnd(report.recognizedMoney.company)} · CK cá nhân ${formatVnd(report.recognizedMoney.transfer)} · tiền mặt ${formatVnd(report.recognizedMoney.cash)}.`
          : "Chưa có booking check-in trong kỳ — doanh thu ghi nhận khi lễ tân bấm nhận phòng."}
      </p>

      <Card>
        <h2 className="mb-2 font-bold">Booking nhận trong kỳ ({report.booked.length})</h2>
        {report.booked.length ? (
          <div className="space-y-2">
            {report.booked.map((row) => (
              <Link key={row.id} href={`/sales/bookings/${row.id}`} className="block rounded-xl bg-sand px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{row.guestName}</p>
                    <p className="text-xs text-[#5c6665]">
                      {row.roomLabel} · {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)}
                    </p>
                    {paidNote(row) ? <p className="mt-1 text-xs text-[#1b7a4e]">{paidNote(row)}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                    <span className="text-xs font-semibold">{formatVnd(row.total)}</span>
                    <span className="text-xs text-[#5c6665]">
                      {isOtaDebt(row.source, row.otaPaymentMode)
                        ? `Công nợ OTA ${formatVnd(row.due)}`
                        : isOtaSource(row.source)
                          ? `Công nợ OTA 0₫ · Khách trả ${formatVnd(row.due)}`
                          : `Còn ${formatVnd(row.due)}`}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Không có booking nhận trong kỳ" text="Đổi tháng / quý / năm." />
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Đã check-in — ghi nhận ({report.recognized.length})</h2>
        {report.recognized.length ? (
          <div className="space-y-2">
            {report.recognized.map((row) => (
              <Link key={row.id} href={`/sales/bookings/${row.id}`} className="block rounded-xl bg-sand px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{row.guestName}</p>
                    <p className="text-xs text-[#5c6665]">
                      Nhận {formatDateNumeric(row.checkIn)} · {row.roomLabel}
                    </p>
                    {paidNote(row) ? <p className="mt-1 text-xs text-[#1b7a4e]">{paidNote(row)}</p> : null}
                  </div>
                  <span className="text-sm font-bold">{formatVnd(row.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Chưa có khách check-in trong kỳ" text="Doanh thu ghi nhận khi lễ tân bấm nhận phòng." />
        )}
      </Card>
    </main>
  );
}
