import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, Chip, Empty, ListPager, Stat, TabChip } from "@/components/ui";
import { DonutChart, GroupedBarChart, HorizontalBarChart } from "@/components/report-charts";
import { ReportTabs } from "@/components/report-tabs";
import { getSession } from "@/lib/auth";
import { listPageSize, pageBounds, parsePage } from "@/lib/booking-desk";
import { SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric, formatPeriodLabel } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookingsByCheckIn } from "@/lib/repos";
import { formatVnd, isOtaDebt, isOtaSource, otaMoneySplit, paidNote } from "@/lib/sales";
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

function hrefFor(grain: ReportGrain, date: string, page?: number, rec?: number) {
  const params = new URLSearchParams({ grain, date });
  if ((page || 1) > 1) params.set("page", String(page));
  if ((rec || 1) > 1) params.set("rec", String(rec));
  return `/reports/sales?${params}`;
}

export default async function SalesRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string; page?: string; rec?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewSalesRevenue")) redirect("/more");
  const { grain: rawGrain, date: rawDate, page: rawPage, rec: rawRec } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const year = window.from.slice(0, 4);
  const bookings = await listBookingsByCheckIn(window.from, window.to);
  const report = roomRevenueReport(bookings, window.from, window.to);
  const pageSize = listPageSize((await headers()).get("user-agent"));
  const bookedBounds = pageBounds(report.booked.length, parsePage(rawPage), pageSize);
  const recognizedBounds = pageBounds(report.recognized.length, parsePage(rawRec), pageSize);
  const bookedRows = report.booked.slice(bookedBounds.start, bookedBounds.start + bookedBounds.take);
  const recognizedRows = report.recognized.slice(recognizedBounds.start, recognizedBounds.start + recognizedBounds.take);
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
          <p className="text-xs text-[#5c6665] md:hidden">
            Theo ngày nhận. Ròng về KS = tổng − VAT − hoa hồng sàn − HH QL OTA 5% − HH AN 6%.
          </p>
          <p className="hidden text-sm text-[#5c6665] md:block">
            Theo ngày nhận trong kỳ, booking không hủy / no-show. Tổng doanh thu là khoản thu từ booking (doanh thu thuần). Giá đã gồm VAT 8%. Hoa hồng sàn OTA cộng theo từng booking. Doanh thu OTA net = OTA − hoa hồng sàn; hoa hồng quản lý OTA = 5% khoản đó; hoa hồng tổng quản lý (AN) = 6% tổng doanh thu. Doanh thu ròng về khách sạn = tổng − VAT − hoa hồng sàn − HH quản lý OTA − HH AN.
          </p>
        </div>
      </div>

      <ReportTabs active="sales" showSales />

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
        <Stat label="Tổng doanh thu" value={formatVnd(report.pnl.total)} highlight="ok" wide />
        <Stat label="Trực tiếp" value={formatVnd(report.pnl.direct)} />
        <Stat label="OTA" value={formatVnd(report.pnl.ota)} />
        <Stat label="VAT 8%" value={formatVnd(report.pnl.vat)} />
        <Stat label="Hoa hồng sàn OTA" value={formatVnd(report.pnl.platformCommission)} tone="text-[#c47b12]" />
        <Stat label="OTA net sau hoa hồng" value={formatVnd(report.pnl.otaNet)} />
        <Stat label="HH quản lý OTA 5%" value={formatVnd(report.pnl.otaMgmtCommission)} tone="text-[#c47b12]" />
        <Stat label="HH tổng quản lý AN 6%" value={formatVnd(report.pnl.anMgmtCommission)} tone="text-[#c47b12]" wide />
        <Stat label="Ròng về khách sạn" value={formatVnd(report.pnl.hotelNet)} highlight="ok" wide />
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
          title="Cơ cấu doanh thu"
          subtitle="Trực tiếp và OTA trong tổng doanh thu booking kỳ này."
          items={[
            { label: "Trực tiếp", value: report.pnl.direct },
            { label: "OTA", value: report.pnl.ota },
          ]}
          centerLabel="tổng DT"
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Doanh thu theo nguồn booking"
          subtitle="6 nguồn có giá trị booking cao nhất."
          items={sourceChart}
          formatValue={formatVnd}
        />
        <HorizontalBarChart
          title="Phân bổ sau hoa hồng"
          subtitle="Hoa hồng sàn, quản lý OTA 5%, tổng quản lý AN 6%, và phần ròng về khách sạn."
          items={[
            { label: "Hoa hồng sàn OTA", value: report.pnl.platformCommission },
            { label: "HH quản lý OTA", value: report.pnl.otaMgmtCommission },
            { label: "HH tổng quản lý AN", value: report.pnl.anMgmtCommission },
            { label: "Ròng về KS", value: report.pnl.hotelNet },
          ]}
          formatValue={formatVnd}
        />
      </section>

      <p className="text-xs text-[#5c6665]">
        {report.booked.length
          ? `${report.booked.length} booking · đã đến ngày nhận ${report.recognized.length} (${formatVnd(report.recognizedPnl.total)}).`
          : "Chưa có booking nhận trong kỳ."}
      </p>

      <Card>
        <h2 className="mb-2 font-bold">Booking nhận trong kỳ ({report.booked.length})</h2>
        {report.booked.length ? (
          <div className="space-y-2">
            {bookedRows.map((row) => (
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
                      {(() => {
                        if (!isOtaDebt(row.source, row.otaPaymentMode)) {
                          return isOtaSource(row.source)
                            ? `Công nợ OTA 0₫ · Khách trả ${formatVnd(row.due)}`
                            : `Còn ${formatVnd(row.due)}`;
                        }
                        const split = otaMoneySplit({
                          source: row.source,
                          otaPaymentMode: row.otaPaymentMode,
                          roomTotal: row.roomTotal,
                          extrasTotal: row.extrasTotal,
                          deposit: row.deposit,
                          refunded: row.refundTotal,
                        });
                        if (!split.extrasTotal) return `Công nợ OTA ${formatVnd(split.otaDue || row.due)}`;
                        return [
                          `Công nợ OTA ${formatVnd(split.otaDue)}`,
                          split.guestDue > 0 ? `Phụ thu ${formatVnd(split.guestDue)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                      })()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Không có booking nhận trong kỳ" text="Đổi tháng / quý / năm." />
        )}
        {bookedBounds.pages > 1 ? (
          <ListPager
            page={bookedBounds.page}
            pages={bookedBounds.pages}
            from={bookedBounds.from}
            to={bookedBounds.to}
            total={bookedBounds.total}
            hrefFor={(next) => hrefFor(grain, window.from, next, recognizedBounds.page)}
          />
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Đã đến ngày nhận — ghi nhận ({report.recognized.length})</h2>
        {report.recognized.length ? (
          <div className="space-y-2">
            {recognizedRows.map((row) => (
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
        {recognizedBounds.pages > 1 ? (
          <ListPager
            page={recognizedBounds.page}
            pages={recognizedBounds.pages}
            from={recognizedBounds.from}
            to={recognizedBounds.to}
            total={recognizedBounds.total}
            hrefFor={(next) => hrefFor(grain, window.from, bookedBounds.page, next)}
          />
        ) : null}
      </Card>
    </main>
  );
}
