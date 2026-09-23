import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addRoomsToBookingAction } from "@/actions/sales";
import { AddBookingRoomsForm } from "@/components/sale-form";
import { BookingCancelActions } from "@/components/booking-cancel";
import { RoomHandoffPanel } from "@/components/room-handoff";
import { Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { getRoomSale, getRoomDayChecklists, getBooking, listRooms, listRoomHandoff } from "@/lib/repos";
import { canCheckinAfterStandby, canCheckoutAfterInspect } from "@/lib/room-handoff";
import { bookingDue, bookingQuote, discountLabel, formatVnd, isOpsBookingCode, isOtaSource, paidNote } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

export default async function SaleDetailPage({
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
  const [sale, rooms] = await Promise.all([getRoomSale(id), listRooms()]);
  if (!sale) notFound();
  const [roomLists, booking, handoff] = await Promise.all([
    sale.roomId ? getRoomDayChecklists(sale.roomId) : Promise.resolve([]),
    getBooking(sale.bookingKey),
    sale.roomId ? listRoomHandoff(sale.roomId) : Promise.resolve([]),
  ]);
  const visibleLists = roomLists.filter((list) => {
    if (list.kind === "checkin") return canCheckinAfterStandby(handoff);
    if (list.kind === "checkout") return canCheckoutAfterInspect(handoff);
    return true;
  });
  const today = todayVN();
  const active = sale.status === "reserved" || sale.status === "inhouse";
  const group = [sale, ...sale.peers].sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""));
  const booked = bookingQuote(group);
  const quote = booked.lines[group.findIndex((row) => row.id === sale.id)] || booked.lines[0];
  const sellable = rooms.filter((room) => room.opsStatus !== "ooo" || room.id === sale.roomId).sort((a, b) => a.number.localeCompare(b.number));
  const taken = new Set(group.map((row) => row.roomId));
  const extraRooms = sellable.filter((room) => !taken.has(room.id) && room.opsStatus !== "ooo");
  const ota = isOtaSource(sale.source);

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <Link href={`/sales?date=${sale.checkIn}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          ← Sơ đồ bán phòng
        </Link>
        <Link href={`/sales/bookings/${sale.bookingKey}`} className="ml-3 inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          Đặt phòng
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{sale.guestName}</h1>
            <p className="text-sm text-[#5c6665]">
              {group.map((row) => `P.${row.room?.number || "—"}`).join(" · ")}
              {sale.room?.type ? ` · ${sale.room.type}` : ""} · {SALE_SOURCE_LABEL[sale.source as SaleSource] || sale.source}
            </p>
            <p className="text-xs text-[#5c6665]">{SALE_ORIGIN_LABEL[(sale.origin as SaleOrigin) || "ops"]}</p>
          </div>
          <Chip tone={STATUS_TONE[sale.status as SaleStatus]}>{SALE_STATUS_LABEL[sale.status as SaleStatus]}</Chip>
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <Card>
        <p className="text-sm">
          {formatDateLong(sale.checkIn)} → {formatDateLong(sale.checkOut)} · {quote.nights} đêm
        </p>
        <p className="mt-1 text-sm">
          {formatVnd(sale.rate)}/đêm · tạm tính {formatVnd(quote.subtotal)}
        </p>
        {quote.breakfastOff ? (
          <p className="mt-1 text-sm text-[#c47b12]">Không ăn sáng −{formatVnd(quote.breakfastOff)}</p>
        ) : null}
        {quote.discount ? (
          <p className="mt-1 text-sm text-[#1b7a4e]">
            Chiết khấu {discountLabel(sale.discountKind, sale.discountValue)} −{formatVnd(quote.discount)}
          </p>
        ) : null}
        {ota ? null : <p className="mt-1 text-sm">Phải thu {formatVnd(booking?.total ?? booked.total)}</p>}
        {booking?.extrasTotal ? (
          <p className="mt-1 text-xs text-[#5c6665]">
            Phòng {formatVnd(booking.roomTotal)} · dịch vụ {formatVnd(booking.extrasTotal)}
          </p>
        ) : null}
        {ota ? (
          <>
            {sale.deposit ? (
              <p className="mt-1 text-sm text-[#1b7a4e]">
                Đã thu {formatVnd(sale.deposit)}
                {paidNote(sale) ? ` · ${paidNote(sale)}` : ""}
              </p>
            ) : null}
            <p className="mt-1 text-sm font-semibold">
              Công nợ OTA {formatVnd(booking?.due ?? bookingDue(booked.total, sale.deposit || 0))}
            </p>
          </>
        ) : (
          <>
            {sale.deposit ? (
              <p className="mt-1 text-sm text-[#1b7a4e]">
                Đã đặt cọc {formatVnd(sale.deposit)}
                {paidNote(sale) ? ` · ${paidNote(sale)}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#c47b12]">Chưa đặt cọc</p>
            )}
            <p className="mt-1 text-sm font-semibold">Còn phải thu {formatVnd(booking?.due ?? bookingDue(booked.total, sale.deposit || 0))}</p>
          </>
        )}
        {sale.guestPhone ? <p className="mt-1 text-sm">SĐT {sale.guestPhone}</p> : null}
        {sale.pmsCode ? <p className="mt-1 text-sm">{isOpsBookingCode(sale.pmsCode) ? "Mã Ops" : "PMS"} {sale.pmsCode}</p> : null}
        {sale.notes ? <p className="mt-2 text-sm text-[#5c6665]">{sale.notes}</p> : null}
      </Card>

      <Link href={`/sales/bookings/${sale.bookingKey}/print`} className="cta-link w-full">
        In phiếu xác nhận đặt phòng
      </Link>

      {sale.peers.length ? (
        <Card>
          <h2 className="mb-2 font-bold">Cùng booking · {group.length} phòng</h2>
          <div className="space-y-2">
            {group.map((row) => (
              <Link
                key={row.id}
                href={`/sales/${row.id}`}
                aria-current={row.id === sale.id ? "page" : undefined}
                className={`flex min-h-12 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${row.id === sale.id ? "bg-[#e8f3f2]" : "bg-sand"}`}
              >
                <span className="font-semibold">
                  P.{row.room?.number || "—"} · {row.room?.type}
                </span>
                <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {active && extraRooms.length ? (
        <Card>
          <h2 className="mb-2 font-bold">Thêm phòng vào booking</h2>
          <p className="mb-2 text-xs text-[#5c6665]">Giữ nguyên khách, ngày, nền tảng. Giá theo bảng hạng phòng thêm.</p>
          <AddBookingRoomsForm action={addRoomsToBookingAction} rooms={extraRooms} saleId={sale.id} />
        </Card>
      ) : null}

      {visibleLists.length ? (
        <Card className="space-y-2">
          <h2 className="font-bold">Checklist lễ tân</h2>
          <p className="text-xs text-[#5c6665]">Mở sau khi HK hoàn thành kiểm phòng. Tick đăng ký / chìa / PMS.</p>
          {visibleLists.map((list) => (
            <Link key={list.id} href={list.taskId ? `/tasks/${list.taskId}` : "/tasks"} className="block min-h-11 text-sm font-semibold text-teal">
              {list.title}
              {list.taskId ? " — mở việc" : ""}
            </Link>
          ))}
        </Card>
      ) : null}

      {sale.roomId && (sale.status === "reserved" || sale.status === "inhouse") ? (
        <RoomHandoffPanel
          roomId={sale.roomId}
          saleId={sale.id}
          saleStatus={sale.status}
          checkIn={sale.checkIn}
          today={today}
          tasks={handoff}
          error={error}
        />
      ) : null}

      {active && can(user.role, "cancelBooking") ? (
        <BookingCancelActions
          kind="sale"
          id={sale.id}
          guestName={sale.guestName}
          deposit={sale.deposit || 0}
          canNoShow={sale.status === "reserved"}
          variant="block"
        />
      ) : null}

      {active ? (
        <Link href={`/sales/bookings/${sale.bookingKey}`} className="cta-link w-full">
          {ota ? "Sửa phòng · chiết khấu" : "Sửa phòng · cọc · chiết khấu"}
        </Link>
      ) : null}
    </main>
  );
}
