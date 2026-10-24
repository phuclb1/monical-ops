import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, CalendarPlus, CircleDollarSign } from "lucide-react";
import { Card, Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { ROLE_LABEL, SALE_SOURCE_LABEL } from "@/lib/constants";
import { addDaysVN, formatDateLong, todayVN } from "@/lib/datetime";
import { homePath } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { listHomeBookings, salesBoard } from "@/lib/repos";
import { formatVnd } from "@/lib/sales";
import { roomRevenueReport } from "@/lib/sales-report";
import type { SaleSource } from "@/lib/types";

const KPI_ICONS = [CalendarPlus, ArrowDownToLine, ArrowUpFromLine, CircleDollarSign] as const;

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "manager") redirect(homePath(user.role));

  const today = todayVN();
  const salesVisible = can(user.role, "manageSales");
  const revenueVisible = can(user.role, "viewSalesRevenue");
  const [bookings, board] = await Promise.all([
    salesVisible || revenueVisible ? listHomeBookings(today) : Promise.resolve([]),
    salesVisible ? salesBoard(today) : Promise.resolve(null),
  ]);
  const tomorrow = addDaysVN(today, 1);
  const todayReport = roomRevenueReport(bookings, today, tomorrow);
  const newBookings = bookings.filter((booking) => booking.createdAt.slice(0, 10) === today);
  const rooms = bookings.flatMap((booking) => booking.rooms);
  const arriving = rooms.filter((room) => room.status === "reserved" && room.checkIn === today).length;
  const departing = rooms.filter((room) => room.checkOut === today && (room.status === "inhouse" || room.status === "reserved")).length;
  const revenueDays = Array.from({ length: 7 }, (_, index) => addDaysVN(today, index - 6)).map((date) => {
    const report = roomRevenueReport(bookings, date, addDaysVN(date, 1));
    return { date, revenue: report.recognizedMoney.total };
  });
  const maxRevenue = Math.max(...revenueDays.map((day) => day.revenue), 1);
  const recentBookings = [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const sourceCounts = new Map<string, number>();
  for (const booking of todayReport.booked) {
    sourceCounts.set(booking.source, (sourceCounts.get(booking.source) || 0) + 1);
  }
  const sources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sourceTotal = Math.max(todayReport.booked.length, 1);
  const roomTotal = board?.cells.length || 0;
  const roomOccupied = board?.inhouse ?? 0;
  const roomReserved = board?.reserved ?? 0;
  const roomAvailable = board?.vacant ?? 0;
  const roomNotReady = Math.max(0, roomTotal - roomOccupied - roomReserved - roomAvailable);
  const kpis = [
    { label: "Booking mới", value: String(newBookings.length), hint: "Tạo hôm nay" },
    { label: "Khách đến", value: String(arriving), hint: "Theo ngày nhận" },
    { label: "Khách đi", value: String(departing), hint: "Theo ngày trả" },
    { label: "Doanh thu hôm nay", value: formatVnd(todayReport.recognizedMoney.total), hint: "Đến ngày nhận, chưa hủy" },
  ];

  return (
    <main className="dashboard-page space-y-4 px-3 py-4 md:space-y-5">
      <header className="dashboard-heading">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">{ROLE_LABEL[user.role]}</p>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-[#6b7372]">{formatDateLong(today)} · Xin chào {user.fullName}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/sales" className="cta-link">Sơ đồ phòng</Link>
        </div>
      </header>

      <section className="dashboard-kpis" aria-label="Chỉ số hôm nay">
        {kpis.map((item, index) => {
          const Icon = KPI_ICONS[index] ?? CalendarPlus;
          return (
            <Card key={item.label} className="dashboard-kpi">
              <div className="dashboard-kpi-icon"><Icon size={18} /></div>
              <p className="text-xs font-semibold text-[#6b7372]">{item.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{item.value}</p>
              <p className="mt-1 text-[11px] text-[#8a7a72]">{item.hint}</p>
            </Card>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <Card className="dashboard-room-card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Tình trạng phòng</h2>
            <Link href="/sales" className="text-xs font-semibold text-teal">Sơ đồ</Link>
          </div>
          <div className="dashboard-room-bar" aria-label={`${roomTotal} phòng`}>
            <span className="is-occupied" style={{ width: `${roomTotal ? (roomOccupied / roomTotal) * 100 : 0}%` }} />
            <span className="is-reserved" style={{ width: `${roomTotal ? (roomReserved / roomTotal) * 100 : 0}%` }} />
            <span className="is-available" style={{ width: `${roomTotal ? (roomAvailable / roomTotal) * 100 : 0}%` }} />
            <span className="is-not-ready" style={{ width: `${roomTotal ? (roomNotReady / roomTotal) * 100 : 0}%` }} />
          </div>
          <div className="dashboard-room-legend">
            <p><i className="is-occupied" />Đang ở <strong>{roomOccupied}</strong></p>
            <p><i className="is-reserved" />Đã giữ <strong>{roomReserved}</strong></p>
            <p><i className="is-available" />Sẵn sàng <strong>{roomAvailable}</strong></p>
            <p><i className="is-not-ready" />Chưa sẵn sàng <strong>{roomNotReady}</strong></p>
          </div>
        </Card>

        {revenueVisible ? (
          <Card className="dashboard-revenue">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">Doanh thu 7 ngày</h2>
                <p className="text-xs text-[#6b7372]">Ghi nhận theo ngày check-in</p>
              </div>
              <Link href="/reports/sales" className="text-xs font-semibold text-teal">Báo cáo</Link>
            </div>
            <div className="dashboard-chart" aria-label="Biểu đồ doanh thu 7 ngày">
              {revenueDays.map((day) => (
                <div key={day.date} className="dashboard-chart-column">
                  <span className="dashboard-chart-value">{day.revenue ? formatVnd(day.revenue) : "0"}</span>
                  <div className="dashboard-chart-track">
                    <i style={{ height: `${Math.max(day.revenue ? 8 : 2, (day.revenue / maxRevenue) * 100)}%` }} />
                  </div>
                  <span>{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {salesVisible ? (
          <Card className="dashboard-sources">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Booking theo nguồn</h2>
              <span className="text-xs text-[#6b7372]">Nhận hôm nay</span>
            </div>
            {sources.length ? (
              <div className="mt-3 space-y-3">
                {sources.map(([source, count]) => (
                  <div key={source}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{SALE_SOURCE_LABEL[source as SaleSource] || source}</span>
                      <strong>{count}</strong>
                    </div>
                    <div className="dashboard-source-track">
                      <i style={{ width: `${(count / sourceTotal) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3"><Empty title="Chưa có booking nhận hôm nay" /></div>
            )}
          </Card>
        ) : null}

        {salesVisible ? (
          <Card className="dashboard-bookings">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Booking mới nhất</h2>
              <Link href="/sales/bookings" className="text-xs font-semibold text-teal">Danh sách</Link>
            </div>
            {recentBookings.length ? (
              <div className="dashboard-booking-list mt-3">
                {recentBookings.map((booking) => (
                  <Link key={booking.id} href={`/sales/bookings/${booking.id}`} className="dashboard-booking-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{booking.guestName}</p>
                      <p className="truncate text-xs text-[#6b7372]">{booking.roomLabel} · {booking.checkIn} → {booking.checkOut}</p>
                    </div>
                    <span className="text-sm font-bold">{formatVnd(booking.total)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-3"><Empty title="Chưa có booking" /></div>
            )}
          </Card>
        ) : null}
      </section>
    </main>
  );
}
