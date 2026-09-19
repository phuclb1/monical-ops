import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { OwnerPeriodBar } from "@/components/owner-period";
import { getSession } from "@/lib/auth";
import { SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, paidNote } from "@/lib/sales";
import { parsePeriodQuery, roomRevenueReport } from "@/lib/sales-report";
import type { SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

export default async function OwnerRevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewOwner")) redirect("/today");
  const { grain: rawGrain, date: rawDate } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const bookings = await listBookings();
  const report = roomRevenueReport(bookings, window.from, window.to);

  return (
    <main className="owner-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Doanh thu</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">
          Booking theo ngày nhận. Doanh thu ghi nhận khi khách check-in thành công.
        </p>
      </div>

      <OwnerPeriodBar basePath="/owner" grain={grain} window={window} />

      <section className="owner-hero card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7372]">Doanh thu ghi nhận</p>
        <p className="owner-hero-value">{formatVnd(report.recognizedMoney.total)}</p>
        <p className="mt-1 text-xs text-[#5c6665]">
          {report.recognized.length
            ? `${report.recognized.length} booking check-in · CK công ty ${formatVnd(report.recognizedMoney.company)} · CK cá nhân ${formatVnd(report.recognizedMoney.transfer)} · tiền mặt ${formatVnd(report.recognizedMoney.cash)}`
            : "Chưa có booking check-in trong kỳ"}
        </p>
      </section>

      <div className="revenue-stats">
        <Stat label="Doanh thu booking" value={formatVnd(report.booking.total)} />
        <Stat label="Đã đặt cọc" value={formatVnd(report.booking.deposit)} tone="text-[#1b7a4e]" />
        <Stat label="Phải thu" value={formatVnd(report.booking.due)} tone="text-[#c47b12]" />
        <Stat label="CK công ty" value={formatVnd(report.booking.company)} />
        <Stat label="CK cá nhân" value={formatVnd(report.booking.transfer)} />
        <Stat label="Tiền mặt" value={formatVnd(report.booking.cash)} />
        <Stat label="Booking nhận" value={String(report.booked.length)} />
      </div>

      <Card>
        <h2 className="mb-2 font-bold">Booking nhận trong kỳ ({report.booked.length})</h2>
        {report.booked.length ? (
          <>
            <div className="booking-list-cards space-y-2">
              {report.booked.map((row) => (
                <div key={row.id} className="rounded-xl bg-sand px-3 py-3">
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
                      <span className="text-sm font-bold">{formatVnd(row.total)}</span>
                      <span className="text-xs text-[#5c6665]">Còn {formatVnd(row.due)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="booking-list-table">
              <div className="booking-list-head">
                <span>Khách</span>
                <span>Phòng</span>
                <span>Ngày</span>
                <span>Trạng thái</span>
                <span className="booking-list-money">Tổng</span>
                <span className="booking-list-money">Còn thu</span>
              </div>
              {report.booked.map((row) => (
                <div key={row.id} className="booking-list-row">
                  <p className="truncate font-bold">{row.guestName}</p>
                  <p className="truncate text-sm">{row.roomLabel}</p>
                  <p className="text-sm text-[#5c6665]">
                    {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)}
                  </p>
                  <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                  <span className="booking-list-money font-semibold">{formatVnd(row.total)}</span>
                  <span className="booking-list-money text-sm text-[#5c6665]">{formatVnd(row.due)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty title="Không có booking nhận trong kỳ" text="Đổi tháng / quý / năm." />
        )}
      </Card>
    </main>
  );
}
