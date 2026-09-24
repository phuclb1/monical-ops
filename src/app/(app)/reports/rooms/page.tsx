import { redirect } from "next/navigation";
import { OwnerPeriodBar } from "@/components/owner-period";
import { DonutChart, GroupedBarChart, HorizontalBarChart } from "@/components/report-charts";
import { ReportTabs } from "@/components/report-tabs";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { salesGantt } from "@/lib/repos";
import { formatVnd } from "@/lib/sales";
import { parsePeriodQuery, roomPerformanceSummary } from "@/lib/sales-report";

function percent(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%";
}

function formatChartPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function soldNightsForRoom(bars: { nightStart: number; nightEnd: number }[], dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) =>
    bars.some((bar) => bar.nightStart <= index && bar.nightEnd > index),
  ).filter(Boolean).length;
}

export default async function RoomPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewSalesRevenue")) redirect("/reports");

  const { grain: rawGrain, date: rawDate } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const report = await salesGantt(window.from, window.to);
  const performance = roomPerformanceSummary(report);
  const roomRows = report.rows
    .map(({ room, bars }) => {
      const sold = soldNightsForRoom(bars, report.days.length);
      const available = room.opsStatus === "ooo" ? 0 : report.days.length;
      return { room, sold, available, occupancy: available > 0 ? sold / available : 0 };
    })
    .sort((a, b) => b.occupancy - a.occupancy || a.room.number.localeCompare(b.room.number));
  const trendBuckets = new Map<string, { label: string; sold: number; available: number }>();
  for (const [index, date] of report.days.entries()) {
    const key = grain === "month" ? date : date.slice(0, 7);
    const label = grain === "month" ? String(Number(date.slice(8, 10))) : `T${Number(date.slice(5, 7))}`;
    const bucket = trendBuckets.get(key) || { label, sold: 0, available: 0 };
    bucket.available += report.sellable;
    bucket.sold += report.rows.filter(
      ({ room, bars }) =>
        room.opsStatus !== "ooo" && bars.some((bar) => bar.nightStart <= index && bar.nightEnd > index),
    ).length;
    trendBuckets.set(key, bucket);
  }
  const occupancyTrend = [...trendBuckets.values()].map((bucket) => ({
    label: bucket.label,
    value: bucket.available ? (bucket.sold / bucket.available) * 100 : 0,
    hint: `${bucket.sold}/${bucket.available} đêm`,
  }));
  const typeBuckets = new Map<string, { sold: number; available: number }>();
  for (const row of roomRows) {
    const bucket = typeBuckets.get(row.room.type) || { sold: 0, available: 0 };
    bucket.sold += row.sold;
    bucket.available += row.available;
    typeBuckets.set(row.room.type, bucket);
  }
  const roomTypeChart = [...typeBuckets.entries()]
    .map(([label, bucket]) => ({
      label,
      value: bucket.available ? (bucket.sold / bucket.available) * 100 : 0,
      hint: `${bucket.sold}/${bucket.available} đêm`,
    }))
    .sort((a, b) => b.value - a.value);
  const topRooms = roomRows
    .filter((row) => row.available > 0)
    .slice(0, 8)
    .map((row) => ({
      label: `P.${row.room.number}`,
      value: row.occupancy * 100,
      hint: `${row.sold}/${row.available} đêm · ${row.room.type}`,
    }));

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Báo cáo hiệu suất phòng</h1>
        <p className="text-xs text-[#5c6665]">Hiệu suất tính theo đêm phòng trong kỳ đã chọn.</p>
      </div>

      <ReportTabs active="rooms" showSales showWork={can(user.role, "viewReports")} />

      <OwnerPeriodBar basePath="/reports/rooms" grain={grain} window={window} />

      <div className="revenue-stats">
        <Stat label="Công suất phòng" value={percent(report.soldNights, performance.availableNights)} />
        <Stat label="Đêm phòng đã bán" value={String(report.soldNights)} />
        <Stat label="Đêm phòng còn trống" value={String(report.vacantNights)} />
        <Stat label="Phòng OOO hiện tại" value={String(report.ooo)} tone="text-[#c23b3b]" />
        <Stat label="Doanh thu phòng" value={formatVnd(report.revenue)} />
        <Stat label="ADR / đêm đã bán" value={formatVnd(performance.adr)} />
        <Stat label="RevPAR / đêm khả dụng" value={formatVnd(performance.revPar)} />
        <Stat label="Phòng khả dụng" value={String(report.sellable)} />
      </div>

      <section className="report-charts-grid" aria-label="Biểu đồ hiệu suất phòng">
        <GroupedBarChart
          title="Xu hướng công suất phòng"
          subtitle="Tỷ lệ đêm đã bán trên tổng đêm phòng khả dụng."
          items={occupancyTrend}
          primaryLabel="Công suất"
          formatValue={formatChartPercent}
        />
        <DonutChart
          title="Cơ cấu đêm phòng"
          subtitle="So sánh đêm đã bán và còn trống trong kỳ."
          items={[
            { label: "Đã bán", value: report.soldNights },
            { label: "Còn trống", value: report.vacantNights },
          ]}
          centerLabel="đêm khả dụng"
        />
        <HorizontalBarChart
          title="Công suất theo hạng phòng"
          subtitle="Tỷ lệ khai thác của từng hạng phòng."
          items={roomTypeChart}
          formatValue={formatChartPercent}
        />
        <HorizontalBarChart
          title="Phòng có công suất cao"
          subtitle="8 phòng được khai thác tốt nhất trong kỳ."
          items={topRooms}
          formatValue={formatChartPercent}
        />
      </section>

      <Card>
        <h2 className="mb-2 font-bold">Hiệu suất từng phòng</h2>
        {roomRows.length ? (
          <div className="space-y-2">
            {roomRows.map(({ room, sold, available }) => (
              <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl bg-sand px-3 py-2">
                <div>
                  <p className="font-bold">P.{room.number}</p>
                  <p className="text-xs text-[#5c6665]">{room.type}</p>
                </div>
                {available ? (
                  <div className="text-right">
                    <p className="font-semibold">{percent(sold, available)}</p>
                    <p className="text-xs text-[#5c6665]">{sold}/{available} đêm</p>
                  </div>
                ) : (
                  <Chip tone="danger">OOO</Chip>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Chưa có dữ liệu phòng" />
        )}
      </Card>
    </main>
  );
}
