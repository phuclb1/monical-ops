import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { OwnerPeriodBar } from "@/components/owner-period";
import { getSession } from "@/lib/auth";
import { SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, isOtaDebt, isOtaSource, paidNote } from "@/lib/sales";
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
          Theo ngày nhận trong kỳ. Đến ngày nhận mà không hủy thì ghi nhận. OTA sau hoa hồng là tiền phòng sau hoa hồng. Công nợ đối tác gồm phải trả hoa hồng và phải thu net chưa về. OTA đã thu tại KS là tiền khách trả tại khách sạn.
        </p>
      </div>

      <OwnerPeriodBar basePath="/owner" grain={grain} window={window} />

      <section className="owner-hero card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7372]">Doanh thu ghi nhận</p>
        <p className="owner-hero-value">{formatVnd(report.recognizedMoney.total)}</p>
        <p className="mt-1 text-xs text-[#5c6665]">
          {report.recognized.length
            ? `${report.recognized.length} booking đã đến ngày nhận · CK cá nhân ${formatVnd(report.recognizedSplit.pay.transfer)} · CK công ty ${formatVnd(report.recognizedSplit.pay.company)} · tiền mặt ${formatVnd(report.recognizedSplit.pay.cash)} · OTA sau hoa hồng ${formatVnd(report.recognizedSplit.ota.net)}`
            : "Chưa có booking đến ngày nhận trong kỳ"}
        </p>
      </section>

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
                      <span className="text-xs text-[#5c6665]">
                        {isOtaDebt(row.source, row.otaPaymentMode)
                          ? `Công nợ OTA ${formatVnd(row.due)}`
                          : isOtaSource(row.source)
                            ? `Công nợ OTA 0₫ · Khách trả ${formatVnd(row.due)}`
                            : `Còn ${formatVnd(row.due)}`}
                      </span>
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
