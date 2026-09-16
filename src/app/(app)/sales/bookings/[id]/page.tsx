import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addRoomsToBookingAction, cancelBookingAction, cancelSaleAction, checkinSaleAction, checkoutSaleAction, updateBookingAction } from "@/actions/sales";
import { AddBookingRoomsForm, BookingForm } from "@/components/sale-form";
import { Btn, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { getBooking, listRooms, listRoomSales, listRoomTypes } from "@/lib/repos";
import { bookingQuote, discountLabel, formatVnd, isActiveSaleStatus, isOpsBookingCode } from "@/lib/sales";
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
  const [booking, rooms, types, sales] = await Promise.all([getBooking(id), listRooms(), listRoomTypes(), listRoomSales()]);
  if (!booking) notFound();
  const today = todayVN();
  const taken = new Set(booking.rooms.map((row) => row.roomId));
  const extraRooms = rooms.filter((room) => !taken.has(room.id) && room.opsStatus !== "ooo").sort((a, b) => a.number.localeCompare(b.number));
  const activeRooms = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  const firstActive = activeRooms[0];
  const booked = bookingQuote(booking.rooms);
  const canNoShow = Boolean(activeRooms.length) && activeRooms.every((row) => row.status === "reserved");
  const back = `/sales/bookings/${booking.id}`;
  const activeIds = new Set(activeRooms.map((row) => row.id));
  const busy = sales
    .filter((row) => isActiveSaleStatus(row.status) && !activeIds.has(row.id))
    .map((row) => ({ roomId: row.roomId, checkIn: row.checkIn, checkOut: row.checkOut }));

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <Link href="/sales/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          ← Đặt phòng
        </Link>
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

      <Card>
        <p className="text-sm">
          {formatDateLong(booking.checkIn)} → {formatDateLong(booking.checkOut)} · {booking.nights} đêm
        </p>
        <p className="mt-1 text-sm">
          {booking.adults} NL{booking.children ? ` · ${booking.children} TE` : ""} · tạm tính {formatVnd(booking.subtotal)}
        </p>
        {firstActive?.discountKind && firstActive.discountKind !== "none" ? (
          <p className="mt-1 text-sm text-[#1b7a4e]">
            Chiết khấu {discountLabel(firstActive.discountKind, firstActive.discountValue)}
            {booking.discount ? ` −${formatVnd(booking.discount)}` : ""}
          </p>
        ) : null}
        <p className="mt-1 text-sm">Phải thu {formatVnd(booking.total)}</p>
        {booking.deposit ? (
          <p className="mt-1 text-sm text-[#1b7a4e]">Đã đặt cọc {formatVnd(booking.deposit)}</p>
        ) : (
          <p className="mt-1 text-sm text-[#c47b12]">Chưa đặt cọc</p>
        )}
        <p className="mt-1 text-sm font-semibold">
          Còn phải thu {formatVnd(booking.due)}
        </p>
        {booking.guestPhone ? <p className="mt-1 text-sm">SĐT {booking.guestPhone}</p> : null}
        {booking.pmsCode ? (
          <p className="mt-1 text-sm">
            {isOpsBookingCode(booking.pmsCode) ? "Mã Ops" : "PMS"} {booking.pmsCode}
          </p>
        ) : null}
        {booking.notes ? <p className="mt-2 text-sm text-[#5c6665]">{booking.notes}</p> : null}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Phòng trong booking</h2>
        <div className="space-y-2">
          {booking.rooms.map((row, index) => {
            const quote = booked.lines[index];
            const active = isActiveSaleStatus(row.status);
            return (
              <div key={row.id} className="rounded-xl bg-sand px-3 py-3">
                <Link href={`/sales/${row.id}`} className="flex min-h-11 items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      P.{row.room?.number || "—"} · {row.room?.type}
                    </p>
                    <p className="text-xs text-[#5c6665]">
                      {formatVnd(row.rate)}/đêm · {quote.nights} đêm · {formatVnd(quote.total)}
                    </p>
                  </div>
                  <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                </Link>
                {active ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {row.status === "reserved" ? (
                      <form action={checkinSaleAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="back" value={back} />
                        <Btn type="submit" className="w-full" disabled={today < row.checkIn}>
                          Nhận
                        </Btn>
                      </form>
                    ) : (
                      <form action={checkoutSaleAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="back" value={back} />
                        <Btn type="submit" className="w-full">
                          Trả
                        </Btn>
                      </form>
                    )}
                    <form action={cancelSaleAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="back" value={back} />
                      <Btn type="submit" variant="ghost" className="w-full">
                        Hủy phòng
                      </Btn>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {firstActive && extraRooms.length ? (
        <Card>
          <h2 className="mb-2 font-bold">Thêm phòng vào booking</h2>
          <p className="mb-2 text-xs text-[#5c6665]">Giữ nguyên khách, ngày, nền tảng. Giá theo bảng hạng phòng thêm.</p>
          <AddBookingRoomsForm action={addRoomsToBookingAction} rooms={extraRooms} saleId={firstActive.id} />
        </Card>
      ) : null}

      {firstActive ? (
        <Card>
          <h2 className="mb-2 font-bold">Sửa booking</h2>
          <p className="mb-2 text-xs text-[#5c6665]">Đổi số phòng cùng hạng, nâng hạng, cọc và chiết khấu. Không sửa thông tin khách.</p>
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
            }))}
            rooms={rooms}
            types={types}
            busy={busy}
            defaults={{
              bookingId: booking.id,
              discountKind: firstActive.discountKind,
              discountValue: firstActive.discountValue,
              deposit: booking.deposit,
            }}
          />
        </Card>
      ) : null}

      {firstActive ? (
        <div className="grid grid-cols-2 gap-2">
          <form action={cancelBookingAction}>
            <input type="hidden" name="bookingId" value={booking.id} />
            <Btn type="submit" variant="ghost" className="w-full">
              Hủy booking
            </Btn>
          </form>
          {canNoShow ? (
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <input type="hidden" name="asNoShow" value="1" />
              <Btn type="submit" variant="danger" className="w-full">
                No-show
              </Btn>
            </form>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      <Link href={`/sales?date=${booking.checkIn}`} className="cta-link w-full">
        Xem sơ đồ ngày nhận
      </Link>
    </main>
  );
}
