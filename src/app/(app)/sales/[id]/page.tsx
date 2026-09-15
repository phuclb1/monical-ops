import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cancelSaleAction, checkinSaleAction, checkoutSaleAction, updateSaleAction } from "@/actions/sales";
import { SaleForm } from "@/components/sale-form";
import { Btn, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { getRoomSale, getRoomDayChecklists, listRooms, listRoomTypes } from "@/lib/repos";
import { discountLabel, formatVnd, isOpsBookingCode, saleQuote } from "@/lib/sales";
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
  const [sale, rooms, types] = await Promise.all([getRoomSale(id), listRooms(), listRoomTypes()]);
  if (!sale) notFound();
  const roomLists = sale.roomId ? await getRoomDayChecklists(sale.roomId) : [];
  const today = todayVN();
  const active = sale.status === "reserved" || sale.status === "inhouse";
  const quote = saleQuote(sale);
  const sellable = rooms.filter((room) => room.opsStatus !== "ooo" || room.id === sale.roomId).sort((a, b) => a.number.localeCompare(b.number));

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <Link href={`/sales?date=${sale.checkIn}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          ← Sơ đồ bán phòng
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{sale.guestName}</h1>
            <p className="text-sm text-[#5c6665]">
              P.{sale.room?.number || "—"} · {sale.room?.type} · {SALE_SOURCE_LABEL[sale.source as SaleSource] || sale.source}
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
        {quote.discount ? (
          <p className="mt-1 text-sm text-[#1b7a4e]">
            Chiết khấu {discountLabel(sale.discountKind, sale.discountValue)} −{formatVnd(quote.discount)}
          </p>
        ) : null}
        <p className="mt-1 text-sm font-semibold">Phải thu {formatVnd(quote.total)}{sale.deposit ? ` · cọc ${formatVnd(sale.deposit)}` : ""}</p>
        {sale.guestPhone ? <p className="mt-1 text-sm">SĐT {sale.guestPhone}</p> : null}
        {sale.pmsCode ? <p className="mt-1 text-sm">{isOpsBookingCode(sale.pmsCode) ? "Mã Ops" : "PMS"} {sale.pmsCode}</p> : null}
        {sale.notes ? <p className="mt-2 text-sm text-[#5c6665]">{sale.notes}</p> : null}
      </Card>

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
        <Card>
          <h2 className="mb-2 font-bold">Sửa chỗ bán</h2>
          <SaleForm
            action={updateSaleAction}
            rooms={sellable}
            types={types}
            submitLabel="Lưu thay đổi"
            defaults={{
              id: sale.id,
              roomId: sale.roomId,
              guestName: sale.guestName,
              guestPhone: sale.guestPhone || "",
              source: sale.source,
              origin: sale.origin || "ops",
              checkIn: sale.checkIn,
              checkOut: sale.checkOut,
              adults: sale.adults,
              children: sale.children,
              rate: sale.rate,
              discountKind: sale.discountKind,
              discountValue: sale.discountValue,
              deposit: sale.deposit,
              pmsCode: sale.pmsCode || "",
              notes: sale.notes || "",
            }}
          />
        </Card>
      ) : null}
    </main>
  );
}
