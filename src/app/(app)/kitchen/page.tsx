import Link from "next/link";
import { redirect } from "next/navigation";
import { Coffee } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { Chip, Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL } from "@/lib/constants";
import { breakfastWeek } from "@/lib/breakfast-report";
import { formatDateLong, formatDayMonth, nextDate, prevDate, todayVN } from "@/lib/datetime";
import { maskPhone } from "@/lib/mask";
import { can } from "@/lib/permissions";
import { listRoomSales, listRoomTypes } from "@/lib/repos";
import type { SaleSource } from "@/lib/types";

function parseDate(raw: string | undefined, today: string) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return today;
}

function hrefFor(date: string) {
  const today = todayVN();
  return date === today ? "/kitchen" : `/kitchen?date=${date}`;
}

function sourceLine(source: string | null, guestName: string) {
  const label = source ? SALE_SOURCE_LABEL[source as SaleSource] : "";
  if (label && (source === "traveloka" || source === "booking" || source === "agoda" || source === "expedia" || source === "airbnb" || source === "ota")) {
    return `${label} · ${guestName}`;
  }
  return guestName;
}

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewKitchen")) redirect("/more");
  const today = todayVN();
  const { date: rawDate } = await searchParams;
  const date = parseDate(rawDate, today);
  const [sales, types] = await Promise.all([listRoomSales(), listRoomTypes()]);
  const week = breakfastWeek(sales, date, types);
  const day = week[0];
  const canOpenBooking = can(user.role, "manageSales");
  const showPhone = can(user.role, "viewGuestPii");

  return (
    <main className="breakfast-report booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="breakfast-head">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Coffee size={22} />
            Ăn sáng
          </h1>
          <p className="mt-1 text-xs text-[#5c6665] md:text-sm">
            {formatDateLong(date).toLowerCase()} · {day.rooms} phòng · {day.stayAdults} NL + {day.stayChildren} TE ở ·{" "}
            {day.adults} NL + {day.children} TE ăn sáng = <strong>{day.servings} suất</strong>
            {day.servings ? ` (${day.checkedIn} đã check-in + ${day.expected} dự kiến)` : ""}
          </p>
        </div>
        <div className="breakfast-nav">
          <Link href={hrefFor(prevDate(date))} className="breakfast-nav-btn">
            ← Hôm qua
          </Link>
          <Link href="/kitchen" className={date === today ? "breakfast-nav-btn is-on" : "breakfast-nav-btn"}>
            Hôm nay
          </Link>
          <Link href={hrefFor(nextDate(date))} className="breakfast-nav-btn">
            Ngày mai →
          </Link>
          <PrintButton compact label="In" fileBaseName={`an-sang-${date}`} />
        </div>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5c6665]">
            Tổng quan 7 ngày tới (kể từ {formatDayMonth(date)})
          </h2>
          <p className="breakfast-legend text-[11px] font-semibold text-[#5c6665]">
            <span className="breakfast-dot is-in" /> đã check-in
            <span className="breakfast-dot is-exp" /> dự kiến (chưa đến)
          </p>
        </div>
        <div className="breakfast-week">
          {week.map((item) => (
            <Link
              key={item.date}
              href={hrefFor(item.date)}
              className={item.date === date ? "breakfast-day is-on" : "breakfast-day"}
            >
              <p className="breakfast-day-label">
                {item.weekday.short} {formatDayMonth(item.date)}
              </p>
              <p className="breakfast-day-count">
                {item.servings} <span>suất</span>
              </p>
              <p className="breakfast-day-rooms">{item.rooms ? `${item.rooms} phòng` : "0 phòng"}</p>
              {item.servings ? (
                <p className="breakfast-day-mix">
                  {item.checkedIn ? (
                    <span>
                      <span className="breakfast-dot is-in" /> {item.checkedIn}
                    </span>
                  ) : null}
                  {item.expected ? (
                    <span>
                      <span className="breakfast-dot is-exp" /> {item.expected}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="breakfast-day-mix is-empty">—</p>
              )}
            </Link>
          ))}
        </div>
      </section>

      {day.rows.length ? (
        <>
          <div className="breakfast-cards space-y-2">
            {day.rows.map((row) => {
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">P.{row.roomNumber}</p>
                      <p className="text-xs text-[#5c6665]">{row.typeLabel}</p>
                    </div>
                    <Chip tone={row.kind === "checked_in" ? "ok" : "gold"}>
                      {row.kind === "checked_in" ? "Đã check-in" : "Dự kiến"}
                    </Chip>
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    #{row.bookingRef} · {sourceLine(row.source, row.guestName)}
                  </p>
                  <p className="text-xs text-[#5c6665]">{showPhone ? row.guestPhone || "—" : maskPhone(row.guestPhone)}</p>
                  <p className="mt-2 text-sm">
                    {row.adults} NL · {row.children} TE ăn sáng · <strong>{row.servings} suất</strong>
                  </p>
                </>
              );
              if (!canOpenBooking) {
                return (
                  <article key={row.saleId} className="card p-4">
                    {inner}
                  </article>
                );
              }
              return (
                <Link key={row.saleId} href={`/sales/bookings/${row.bookingId}`} className="card block p-4">
                  {inner}
                </Link>
              );
            })}
          </div>

          <div className="breakfast-table">
            <table>
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Loại</th>
                  <th>Khách / đoàn</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th className="num">NL</th>
                  <th className="num">TE</th>
                  <th className="num">Tổng suất</th>
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row) => {
                  const guest = (
                    <>
                      <p className="breakfast-ref">#{row.bookingRef}</p>
                      <p>{sourceLine(row.source, row.guestName)}</p>
                    </>
                  );
                  return (
                    <tr key={row.saleId}>
                      <td className="font-bold">P.{row.roomNumber}</td>
                      <td className="text-[#5c6665]">{row.typeLabel}</td>
                      <td>
                        {canOpenBooking ? (
                          <Link href={`/sales/bookings/${row.bookingId}`} className="font-semibold text-ink">
                            {guest}
                          </Link>
                        ) : (
                          <div className="font-semibold">{guest}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{showPhone ? row.guestPhone || "—" : maskPhone(row.guestPhone)}</td>
                      <td>
                        <Chip tone={row.kind === "checked_in" ? "ok" : "gold"}>
                          {row.kind === "checked_in" ? "Đã check-in" : "Dự kiến"}
                        </Chip>
                      </td>
                      <td className="num">{row.adults}</td>
                      <td className="num">{row.children}</td>
                      <td className="num font-bold">{row.servings}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="font-bold">
                    Tổng cộng ({day.rooms} phòng)
                  </td>
                  <td className="num font-bold">{day.adults}</td>
                  <td className="num font-bold">{day.children}</td>
                  <td className="num font-bold">{day.servings}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <Empty title="Không có suất ăn sáng" text="Không có booking ngủ đêm trước ngày này, hoặc phòng đã tắt ăn sáng." />
      )}

      <p className="breakfast-split text-xs font-semibold text-[#5c6665]">
        Phân tích:
        <span className="breakfast-dot is-in" /> {day.checkedIn} đã check-in ·
        <span className="breakfast-dot is-exp" /> {day.expected} dự kiến (chưa đến)
      </p>
      <p className="text-xs leading-5 text-[#5c6665]">
        Báo cáo dành cho nhà hàng chuẩn bị bữa sáng. Gồm khách đã check-in và khách dự kiến (booking đã tạo, chưa nhận
        phòng). Khách nhận phòng đúng ngày này không hiện trên báo cáo cùng ngày — ăn sáng hôm sau, sau khi đã ngủ đêm.
        Booking hủy / no-show không tính. Phòng tắt ăn sáng không tính. Số khách ăn sáng không lớn hơn số khách ở —
        booking nhiều phòng không nhân số khách.
      </p>
      <p className="breakfast-no-print text-sm">
        <Link href="/kitchen/forecast" className="font-semibold text-teal">
          Dự báo thủ công · chay / dị ứng / suất sớm
        </Link>
        {canOpenBooking ? (
          <>
            <span className="text-[#5c6665]"> · </span>
            <Link href="/sales/bookings" className="font-semibold text-teal">
              Đặt phòng
            </Link>
          </>
        ) : null}
      </p>
    </main>
  );
}
