import { redirect } from "next/navigation";
import { Card, Chip, Empty, Stat } from "@/components/ui";
import { OwnerPeriodBar } from "@/components/owner-period";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd } from "@/lib/sales";
import { ownerGuestReport, parsePeriodQuery } from "@/lib/sales-report";
import type { SaleSource, SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

export default async function OwnerGuestsPage({
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
  const report = ownerGuestReport(bookings, window.from, window.to);
  const topSource = report.bySource[0];

  return (
    <main className="owner-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Thông tin khách</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">Khách nhận phòng trong tháng / quý / năm. Chỉ xem, không sửa.</p>
      </div>

      <OwnerPeriodBar basePath="/owner/guests" grain={grain} window={window} />

      <div className="revenue-stats">
        <Stat label="Booking" value={String(report.bookings)} />
        <Stat label="Khách" value={String(report.people)} />
        <Stat label="Người lớn" value={String(report.adults)} />
        <Stat label="Trẻ em" value={String(report.children)} />
        <Stat label="Đêm phòng" value={String(report.roomNights)} />
        <Stat label="Đang lưu trú" value={String(report.staying.length)} />
      </div>
      {topSource ? (
        <p className="text-xs text-[#5c6665]">
          Nguồn nhiều nhất: {SALE_SOURCE_LABEL[topSource[0] as SaleSource] || topSource[0]} ({topSource[1]})
        </p>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">Khách nhận trong kỳ ({report.guests.length})</h2>
        {report.guests.length ? (
          <>
            <div className="booking-list-cards space-y-2">
              {report.guests.map((row) => (
                <div key={row.id} className="rounded-xl bg-sand px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{row.guestName}</p>
                      <p className="text-xs text-[#5c6665]">{row.guestPhone || "—"}</p>
                      <p className="mt-1 text-xs text-[#5c6665]">
                        {row.roomLabel} · {row.adults} NL{row.children ? ` · ${row.children} TE` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[#5c6665]">
                        {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)} · {row.nights} đêm ·{" "}
                        {SALE_SOURCE_LABEL[row.source as SaleSource] || row.source}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                      <span className="text-sm font-bold">{formatVnd(row.total)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="owner-guest-table">
              <div className="owner-guest-head">
                <span>Khách</span>
                <span>SĐT</span>
                <span>Phòng</span>
                <span>Ngày</span>
                <span>Nguồn</span>
                <span>Trạng thái</span>
                <span className="booking-list-money">Tổng</span>
              </div>
              {report.guests.map((row) => (
                <div key={row.id} className="owner-guest-row">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.guestName}</p>
                    <p className="text-xs text-[#5c6665]">
                      {row.adults} NL{row.children ? ` · ${row.children} TE` : ""}
                    </p>
                  </div>
                  <p className="text-sm">{row.guestPhone || "—"}</p>
                  <p className="truncate text-sm">{row.roomLabel}</p>
                  <p className="text-sm text-[#5c6665]">
                    {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)}
                  </p>
                  <p className="text-sm">{SALE_SOURCE_LABEL[row.source as SaleSource] || row.source}</p>
                  <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                  <span className="booking-list-money font-semibold">{formatVnd(row.total)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty title="Không có khách nhận trong kỳ" text="Đổi tháng / quý / năm." />
        )}
      </Card>
    </main>
  );
}
