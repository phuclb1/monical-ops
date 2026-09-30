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
            Theo ngày nhận trong kỳ. Booking chưa đến ngày nhận chỉ tính vào doanh thu booking. Đến ngày nhận mà không hủy thì ghi nhận. CK cá nhân, CK công ty và tiền mặt là tiền đã thu của booking trực tiếp. OTA sau hoa hồng là tiền phòng sau hoa hồng. Công nợ đối tác tách thành phải trả hoa hồng và phải thu đối tác (net chưa về). OTA đã thu tại KS là tiền khách trả tại khách sạn.
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
        <Stat label="Doanh thu tổng booking" value={formatVnd(report.booking.total)} />
        <Stat label="Doanh thu tổng ghi nhận" value={formatVnd(report.recognizedMoney.total)} />
        <Stat label="Ghi nhận CK cá nhân" value={formatVnd(report.recognizedSplit.pay.transfer)} />
        <Stat label="Ghi nhận CK công ty" value={formatVnd(report.recognizedSplit.pay.company)} />
        <Stat label="Ghi nhận tiền mặt" value={formatVnd(report.recognizedSplit.pay.cash)} />
        <Stat label="OTA sau hoa hồng" value={formatVnd(report.recognizedSplit.ota.net)} />
        <Stat label="Phải trả hoa hồng" value={formatVnd(report.recognizedSplit.ota.commission)} tone="text-[#c47b12]" />
        <Stat label="Phải thu đối tác" value={formatVnd(report.recognizedSplit.ota.partnerNet)} tone="text-[#c47b12]" />
        <Stat label="OTA đã thu tại KS" value={formatVnd(report.recognizedSplit.ota.collectedGross)} />
      </div>

      <section className="report-charts-grid" aria-label="Biểu đồ doanh thu">
        <GroupedBarChart
          title="Xu hướng doanh thu"
          subtitle="Theo ngày nhận. Booking chưa đến ngày nhận chưa được ghi nhận."
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
          title="Tiền đã ghi nhận"
          subtitle="Trực tiếp đã thu, OTA khách trả tại KS, và phải thu đối tác chưa về."
          items={[
            { label: "CK cá nhân", value: report.recognizedSplit.pay.transfer },
            { label: "CK công ty", value: report.recognizedSplit.pay.company },
            { label: "Tiền mặt", value: report.recognizedSplit.pay.cash },
            { label: "OTA đã thu", value: report.recognizedSplit.ota.collectedGross },
            { label: "Phải thu đối tác", value: report.recognizedSplit.ota.partnerNet },
          ]}
          centerLabel="đã ghi nhận"
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Doanh thu theo nguồn booking"
          subtitle="6 nguồn có giá trị booking cao nhất."
          items={sourceChart}
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Cơ cấu ghi nhận"
          subtitle="Tiền trực tiếp đã thu, OTA đã thu tại KS, phải thu đối tác và phải trả hoa hồng."
          items={[
            { label: "CK cá nhân", value: report.recognizedSplit.pay.transfer },
            { label: "CK công ty", value: report.recognizedSplit.pay.company },
            { label: "Tiền mặt", value: report.recognizedSplit.pay.cash },
            { label: "OTA đã thu", value: report.recognizedSplit.ota.collectedGross },
            { label: "Phải thu đối tác", value: report.recognizedSplit.ota.partnerNet },
            { label: "Phải trả hoa hồng", value: report.recognizedSplit.ota.commission },
          ]}
          formatValue={formatVnd}
        />
      </section>

      <p className="text-xs text-[#5c6665]">
        {report.recognized.length
          ? `Ghi nhận ${report.recognized.length} booking đã đến ngày nhận. Công nợ đối tác tách hai khoản: phải trả hoa hồng ${formatVnd(report.recognizedSplit.ota.commission)}, phải thu đối tác ${formatVnd(report.recognizedSplit.ota.partnerNet)} (net OTA chưa về, sau hoa hồng). OTA đã thu tại KS ${formatVnd(report.recognizedSplit.ota.collectedGross)} đã vào tiền khách sạn; hoa hồng phần này ${formatVnd(report.recognizedSplit.ota.collectedCommission)} nằm trong phải trả hoa hồng.`
          : "Chưa có booking đến ngày nhận trong kỳ. Doanh thu tự ghi nhận khi đến ngày check-in và booking không hủy."}
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
        <h2 className="mb-2 font-bold">Đã đến ngày nhận — ghi nhận ({report.recognized.length})</h2>
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
          <Empty title="Chưa có booking đến ngày nhận" text="Doanh thu tự ghi nhận khi đến ngày check-in và booking không hủy." />
        )}
      </Card>
    </main>
  );
}
