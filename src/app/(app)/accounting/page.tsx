import { redirect } from "next/navigation";
import { OwnerPeriodBar } from "@/components/owner-period";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { homePath } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, isOtaDebt, paidNote, salePaid } from "@/lib/sales";
import { parsePeriodQuery, roomRevenueReport } from "@/lib/sales-report";
import type { SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

function paymentLabel(row: Awaited<ReturnType<typeof listBookings>>[number]) {
  if (isOtaDebt(row.source, row.otaPaymentMode)) return `Công nợ OTA ${formatVnd(row.due)}`;
  return paidNote(row) || (row.due > 0 ? "Chưa thanh toán" : "Đã thanh toán");
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewAccounting")) redirect(homePath(user.role));

  const { grain: rawGrain, date: rawDate } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const bookings = await listBookings();
  const report = roomRevenueReport(bookings, window.from, window.to);
  const invoicedRevenue = report.recognized.filter((row) => row.invoiceRequested);
  const invoiceMoney = invoicedRevenue.reduce(
    (sum, row) => {
      const paid = salePaid(row);
      sum.total += row.total;
      sum.company += paid.companyPaid;
      sum.transfer += paid.transferPaid;
      sum.cash += paid.cashPaid;
      sum.due += row.due;
      return sum;
    },
    { total: 0, company: 0, transfer: 0, cash: 0, due: 0 },
  );

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Kế toán</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">
          Chỉ xem booking, tiền thanh toán và doanh thu có yêu cầu xuất hóa đơn.
        </p>
      </div>

      <OwnerPeriodBar basePath="/accounting" grain={grain} window={window} />

      <section className="owner-hero card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7372]">
          Doanh thu ghi nhận có xuất hóa đơn
        </p>
        <p className="owner-hero-value">{formatVnd(invoiceMoney.total)}</p>
        <p className="mt-1 text-xs text-[#5c6665]">
          {invoicedRevenue.length} booking đã check-in và yêu cầu xuất hóa đơn trong kỳ.
        </p>
      </section>

      <div className="revenue-stats">
        <Stat label="CK công ty" value={formatVnd(invoiceMoney.company)} />
        <Stat label="CK cá nhân" value={formatVnd(invoiceMoney.transfer)} />
        <Stat label="Tiền mặt" value={formatVnd(invoiceMoney.cash)} />
        <Stat label="Còn phải thu" value={formatVnd(invoiceMoney.due)} tone="text-[#c47b12]" />
      </div>

      <Card>
        <h2 className="mb-2 font-bold">Booking nhận trong kỳ ({report.booked.length})</h2>
        {report.booked.length ? (
          <div className="space-y-2">
            {report.booked.map((row) => (
              <div key={row.id} className="rounded-xl bg-sand px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">Booking {row.pmsCode || row.id.slice(0, 8)}</p>
                    <p className="text-xs text-[#5c6665]">
                      {row.roomLabel} · {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)}
                    </p>
                    <p className="mt-1 text-xs text-[#1b7a4e]">{paymentLabel(row)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Chip tone={STATUS_TONE[row.status as SaleStatus]}>
                      {SALE_STATUS_LABEL[row.status as SaleStatus]}
                    </Chip>
                    <span className="text-sm font-bold">{formatVnd(row.total)}</span>
                    <span className="text-xs text-[#5c6665]">Còn {formatVnd(row.due)}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs font-semibold">
                  Hóa đơn: {row.invoiceRequested ? "Có yêu cầu xuất" : "Không xuất"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Không có booking nhận trong kỳ" text="Đổi tháng / quý / năm." />
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Doanh thu có xuất hóa đơn ({invoicedRevenue.length})</h2>
        {invoicedRevenue.length ? (
          <div className="space-y-2">
            {invoicedRevenue.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl bg-sand px-3 py-3">
                <div>
                  <p className="font-bold">Booking {row.pmsCode || row.id.slice(0, 8)}</p>
                  <p className="text-xs text-[#5c6665]">
                    Nhận {formatDateNumeric(row.checkIn)} · {row.roomLabel}
                  </p>
                  <p className="mt-1 text-xs text-[#1b7a4e]">{paymentLabel(row)}</p>
                </div>
                <span className="shrink-0 text-sm font-bold">{formatVnd(row.total)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Chưa có doanh thu xuất hóa đơn trong kỳ" />
        )}
      </Card>
    </main>
  );
}
