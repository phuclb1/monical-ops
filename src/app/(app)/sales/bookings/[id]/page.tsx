import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addRoomsToBookingAction, updateBookingAction } from "@/actions/sales";
import { AddBookingRoomsForm, BookingForm } from "@/components/sale-form";
import { BookingCancelActions } from "@/components/booking-cancel";
import { BookingExtrasPanel } from "@/components/booking-extras";
import { BookingPaymentPanel } from "@/components/booking-payment";
import { BookingRoomList } from "@/components/booking-room-list";
import { BookingLog } from "@/components/booking-log";
import { Card, Chip, Fold } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, todayVN } from "@/lib/datetime";
import { extraDetail } from "@/lib/extras";
import { can } from "@/lib/permissions";
import { getBooking, listBookingLogs, listRooms, listRoomSales, listRoomTypes, listSaleExtraTypes } from "@/lib/repos";
import { bookingQuote, formatVnd, isActiveSaleStatus, isOpsBookingCode, paidNote, parkingLabel } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { id } = await params;
  const { error } = await searchParams;
  const [booking, rooms, types, sales, extraTypes, logs] = await Promise.all([
    getBooking(id),
    listRooms(),
    listRoomTypes(),
    listRoomSales(),
    listSaleExtraTypes(),
    listBookingLogs(id),
  ]);
  if (!booking) notFound();
  const today = todayVN();
  const taken = new Set(booking.rooms.map((row) => row.roomId));
  const extraRooms = rooms.filter((room) => !taken.has(room.id) && room.opsStatus !== "ooo").sort((a, b) => a.number.localeCompare(b.number));
  const activeRooms = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  const firstActive = activeRooms[0];
  const booked = bookingQuote(booking.rooms);
  const canNoShow = Boolean(activeRooms.length) && activeRooms.every((row) => row.status === "reserved");
  const readyIn = activeRooms.filter((row) => row.status === "reserved" && today >= row.checkIn);
  const staying = activeRooms.filter((row) => row.status === "inhouse");
  const activeIds = new Set(activeRooms.map((row) => row.id));
  const busy = sales
    .filter((row) => isActiveSaleStatus(row.status) && !activeIds.has(row.id))
    .map((row) => ({ roomId: row.roomId, checkIn: row.checkIn, checkOut: row.checkOut }));

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link href="/sales/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
            ← Đặt phòng
          </Link>
          <div className="flex items-center gap-3">
            <Link href={`/sales/bookings/${booking.id}/print`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
              In xác nhận
            </Link>
            <Link href={`/sales?date=${booking.checkIn}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
              Sơ đồ
            </Link>
          </div>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{booking.guestName}</h1>
            <p className="text-sm text-[#5c6665]">
              {booking.roomCount} phòng · {booking.roomLabel}
            </p>
            <p className="text-xs text-[#5c6665]">
              {SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source} · {SALE_ORIGIN_LABEL[(booking.origin as SaleOrigin) || "ops"]}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip tone={STATUS_TONE[booking.status]}>{SALE_STATUS_LABEL[booking.status]}</Chip>
            {booking.deposit ? <Chip tone="ok">Đã cọc</Chip> : isActiveSaleStatus(booking.status) ? <Chip tone="warn">Chưa cọc</Chip> : null}
          </div>
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <div className="booking-desk-grid space-y-3 md:space-y-0">
        <aside className="booking-desk-side space-y-3">
          <Card>
            <p className="text-sm">
              {formatDateLong(booking.checkIn)} → {formatDateLong(booking.checkOut)} · {booking.nights} đêm
            </p>
            <p className="mt-1 text-sm">
              {booking.adults} NL{booking.children ? ` · ${booking.children} TE` : ""} ở
              {` · ăn sáng ${booking.breakfastAdults} NL${booking.breakfastChildren ? ` · ${booking.breakfastChildren} TE` : ""}`}
              {parkingLabel(booking.cars, booking.bikes) !== "—" ? ` · ${parkingLabel(booking.cars, booking.bikes)}` : ""} · tạm tính {formatVnd(booking.subtotal)}
            </p>
            {booking.breakfastOff ? (
              <p className="mt-1 text-sm text-[#c47b12]">Không ăn sáng −{formatVnd(booking.breakfastOff)}</p>
            ) : null}
            {booking.discount ? (
              <p className="mt-1 text-sm text-[#1b7a4e]">Chiết khấu −{formatVnd(booking.discount)}</p>
            ) : null}
            <p className="mt-1 text-sm">Phải thu {formatVnd(booking.total)}</p>
            {booking.extrasTotal ? (
              <p className="mt-1 text-sm">
                Phòng {formatVnd(booking.roomTotal)} · dịch vụ {formatVnd(booking.extrasTotal)}
              </p>
            ) : null}
            {booking.extras.map((row) => (
              <p key={row.id} className="mt-1 text-xs text-[#5c6665]">
                {row.name}
                {extraDetail(row, booking.nights) ? ` · ${extraDetail(row, booking.nights)}` : ""} · {formatVnd(row.amount)}
              </p>
            ))}
            {booking.deposit ? (
              <p className="mt-1 text-sm text-[#1b7a4e]">
                Đã đặt cọc {formatVnd(booking.deposit)}
                {paidNote(booking) ? ` · ${paidNote(booking)}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#c47b12]">Chưa đặt cọc</p>
            )}
            <p className="mt-1 text-sm font-semibold">Còn phải thu {formatVnd(booking.due)}</p>
            {booking.guestPhone ? <p className="mt-1 text-sm">SĐT {booking.guestPhone}</p> : null}
            {booking.pmsCode ? (
              <p className="mt-1 text-sm">
                {isOpsBookingCode(booking.pmsCode) ? "Mã Ops" : "PMS"} {booking.pmsCode}
              </p>
            ) : null}
            {booking.notes ? <p className="mt-2 text-sm text-[#5c6665]">{booking.notes}</p> : null}
            {firstActive ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-2 text-xs font-semibold text-[#5c6665]">Thanh toán</p>
                <BookingPaymentPanel
                  bookingId={booking.id}
                  deposit={booking.deposit}
                  due={booking.due}
                  cashPaid={booking.cashPaid}
                  transferPaid={booking.transferPaid}
                  companyPaid={booking.companyPaid}
                />
              </div>
            ) : null}
            {readyIn.length || staying.length ? (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <p className="text-xs text-[#5c6665]">Gửi HK kiểm phòng trên từng chỗ bán, rồi mới nhận hoặc hoàn tất trả.</p>
                {[...readyIn, ...staying].map((row) => (
                  <Link key={row.id} href={`/sales/${row.id}`} className="cta-link w-full">
                    P.{row.room?.number || "—"} · Giao việc HK
                  </Link>
                ))}
              </div>
            ) : null}
          </Card>

          {firstActive && can(user.role, "cancelBooking") ? (
            <BookingCancelActions
              kind="booking"
              id={booking.id}
              guestName={booking.guestName}
              deposit={booking.deposit}
              canNoShow={canNoShow}
            />
          ) : null}
        </aside>

        <div className="booking-desk-main space-y-3">
          <Card>
            <h2 className="mb-1 font-bold">Phòng trong booking</h2>
            <BookingRoomList
              rooms={booking.rooms}
              quotes={booked.lines}
              totals={{
                roomTotal: booking.roomTotal,
                discount: booking.discount,
                breakfastOff: booking.breakfastOff,
                extrasTotal: booking.extrasTotal,
                total: booking.total,
                deposit: booking.deposit,
                due: booking.due,
              }}
            />
          </Card>

          <Card>
            <h2 className="mb-1 font-bold">Nhật ký</h2>
            <p className="mb-3 text-xs text-[#5c6665]">Ai tạo, ai sửa, sửa gì, lúc nào.</p>
            <BookingLog
              rows={logs}
              rooms={Object.fromEntries(rooms.map((room) => [room.id, room.number]))}
            />
          </Card>

          {firstActive ? (
            <Fold title="Dịch vụ / phụ thu" hint={booking.extras.length ? `${booking.extras.length}` : undefined}>
              <BookingExtrasPanel
                bookingId={booking.id}
                nights={booking.nights}
                types={extraTypes.filter((row) => row.active)}
                extras={booking.extras}
              />
            </Fold>
          ) : null}

          {firstActive && extraRooms.length ? (
            <Fold title="Thêm phòng">
              <p className="mb-2 text-xs text-[#5c6665]">Giữ nguyên khách, ngày, nền tảng. Giá theo bảng hạng phòng thêm.</p>
              <AddBookingRoomsForm action={addRoomsToBookingAction} rooms={extraRooms} saleId={firstActive.id} />
            </Fold>
          ) : null}

          {firstActive ? (
            <Fold title="Sửa booking">
              <p className="mb-2 text-xs text-[#5c6665]">Sửa tên, SĐT, số khách, kênh. Đổi số phòng cùng hạng hoặc nâng hạng. Ngày, ăn sáng và chiết khấu theo từng phòng.</p>
              <BookingForm
                action={updateBookingAction}
                lines={activeRooms.map((row) => ({
                  saleId: row.id,
                  roomId: row.roomId,
                  number: row.room?.number || "—",
                  type: row.room?.type || "",
                  rate: row.rate,
                  checkIn: row.checkIn,
                  checkOut: row.checkOut,
                  breakfast: row.breakfast !== false,
                  discountKind: row.discountKind,
                  discountValue: row.discountValue,
                  status: row.status,
                }))}
                rooms={rooms}
                types={types}
                busy={busy}
                extras={booking.extras}
                defaults={{
                  bookingId: booking.id,
                  guestName: booking.guestName,
                  guestPhone: booking.guestPhone || "",
                  source: booking.source,
                  adults: booking.adults,
                  children: booking.children,
                  breakfastAdults: booking.breakfastAdults,
                  breakfastChildren: booking.breakfastChildren,
                  cars: booking.cars,
                  bikes: booking.bikes,
                  deposit: booking.deposit,
                  cashPaid: booking.cashPaid,
                  transferPaid: booking.transferPaid,
                  companyPaid: booking.companyPaid,
                  notes: booking.notes || "",
                }}
              />
            </Fold>
          ) : null}
        </div>
      </div>
    </main>
  );
}
