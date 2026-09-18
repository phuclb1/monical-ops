import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addRoomsToBookingAction, cancelSaleAction, checkinSaleAction, checkoutSaleAction } from "@/actions/sales";
import { AddBookingRoomsForm } from "@/components/sale-form";
import { Btn, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { getRoomSale, getRoomDayChecklists, getBooking, listRooms } from "@/lib/repos";
import { bookingDue, bookingQuote, discountLabel, formatVnd, isOpsBookingCode } from "@/lib/sales";
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
  const [roomLists, booking] = await Promise.all([
    sale.roomId ? getRoomDayChecklists(sale.roomId) : Promise.resolve([]),
    getBooking(sale.bookingKey),
  ]);
  const today = todayVN();
  const active = sale.status === "reserved" || sale.status === "inhouse";
  const group = [sale, ...sale.peers].sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || ""));
  const booked = bookingQuote(group);
  const quote = booked.lines[group.findIndex((row) => row.id === sale.id)] || booked.lines[0];
  const sellable = rooms.filter((room) => room.opsStatus !== "ooo" || room.id === sale.roomId).sort((a, b) => a.number.localeCompare(b.number));
  const taken = new Set(group.map((row) => row.roomId));
  const extraRooms = sellable.filter((room) => !taken.has(room.id) && room.opsStatus !== "ooo");

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
        <p className="mt-1 text-sm">Phải thu {formatVnd(booking?.total ?? booked.total)}</p>
        {booking?.extrasTotal ? (
          <p className="mt-1 text-xs text-[#5c6665]">
            Phòng {formatVnd(booking.roomTotal)} · dịch vụ {formatVnd(booking.extrasTotal)}
          </p>
        ) : null}
        {sale.deposit ? (
          <p className="mt-1 text-sm text-[#1b7a4e]">Đã đặt cọc {formatVnd(sale.deposit)}</p>
        ) : (
          <p className="mt-1 text-sm text-[#c47b12]">Chưa đặt cọc</p>
        )}
        <p className="mt-1 text-sm font-semibold">Còn phải thu {formatVnd(booking?.due ?? bookingDue(booked.total, sale.deposit || 0))}</p>
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

      {roomLists.length ? (
        <Card className="space-y-2">
          <h2 className="font-bold">Checklist lễ tân</h2>
          <p className="text-xs text-[#5c6665]">Không chặn nhận / trả phòng. Tick trên việc theo phòng.</p>
          {roomLists.map((list) => (
            <Link key={list.id} href={list.taskId ? `/tasks/${list.taskId}` : "/tasks"} className="block min-h-11 text-sm font-semibold text-teal">
              {list.title}
              {list.taskId ? " — mở việc" : ""}
            </Link>
          ))}
        </Card>
      ) : null}

      {sale.status === "reserved" ? (
        <form action={checkinSaleAction}>
          <input type="hidden" name="id" value={sale.id} />
          <Btn type="submit" className="w-full" disabled={today < sale.checkIn}>
            Nhận phòng
          </Btn>
        </form>
      ) : null}
      {sale.status === "inhouse" ? (
        <form action={checkoutSaleAction}>
          <input type="hidden" name="id" value={sale.id} />
          <Btn type="submit" className="w-full">
            Trả phòng
          </Btn>
        </form>
      ) : null}

      {active ? (
        <div className="grid grid-cols-2 gap-2">
          <form action={cancelSaleAction}>
            <input type="hidden" name="id" value={sale.id} />
            <Btn type="submit" variant="ghost" className="w-full">
              Hủy chỗ
            </Btn>
          </form>
          {sale.status === "reserved" ? (
            <form action={cancelSaleAction}>
              <input type="hidden" name="id" value={sale.id} />
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

      {active ? (
        <Link href={`/sales/bookings/${sale.bookingKey}`} className="cta-link w-full">
          Sửa phòng · cọc · chiết khấu
        </Link>
      ) : null}
    </main>
  );
}
