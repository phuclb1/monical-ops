import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { OwnerPeriodBar } from "@/components/owner-period";
import { getSession } from "@/lib/auth";
import { SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookingsByCheckIn } from "@/lib/repos";
import { formatVnd, isOtaDebt, isOtaSource, otaMoneySplit, paidNote } from "@/lib/sales";
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
  if (!can(user.role, "viewOwner")) redirect("/login");
  const { grain: rawGrain, date: rawDate } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const bookings = await listBookingsByCheckIn(window.from, window.to);
  const report = roomRevenueReport(bookings, window.from, window.to);

  return (
    <main className="owner-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Doanh thu</h1>
        <p className="text-xs text-[#5c6665] md:hidden">
          Theo ngày nhận. Ròng về KS = tổng − VAT − các hoa hồng.
        </p>
        <p className="hidden text-sm text-[#5c6665] md:block">
          Theo ngày nhận trong kỳ, booking không hủy / no-show. Tổng doanh thu là khoản thu từ booking. VAT 8% tách từ giá đã gồm thuế. Hoa hồng sàn theo từng booking OTA; hoa hồng quản lý OTA 5% trên OTA net; hoa hồng tổng quản lý (AN) 6% tổng doanh thu. Doanh thu ròng về khách sạn = tổng − VAT − các khoản hoa hồng.
        </p>
      </div>

      <OwnerPeriodBar basePath="/owner" grain={grain} window={window} />

      <section className="owner-hero card">
        <p className="text-[11px] font-semibold text-[#6b7372]">Ròng về khách sạn</p>
        <p className="owner-hero-value">{formatVnd(report.pnl.hotelNet)}</p>
        <p className="mt-1 text-xs text-[#5c6665]">
          {report.booked.length
            ? `${report.booked.length} booking · tổng ${formatVnd(report.pnl.total)} · HH sàn ${formatVnd(report.pnl.platformCommission)} · HH OTA ${formatVnd(report.pnl.otaMgmtCommission)} · HH AN ${formatVnd(report.pnl.anMgmtCommission)}`
            : "Chưa có booking nhận trong kỳ"}
        </p>
      </section>

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
