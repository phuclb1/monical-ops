import Link from "next/link";
import { redirect } from "next/navigation";
import { createSaleAction } from "@/actions/sales";
import { SaleForm } from "@/components/sale-form";
import { getSession } from "@/lib/auth";
import { catalogRate, defaultCheckout } from "@/lib/sales";
import { todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listRooms, listRoomTypes } from "@/lib/repos";

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; date?: string; error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { room, date: rawDate, error } = await searchParams;
  const today = todayVN();
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const [rooms, types] = await Promise.all([listRooms(), listRoomTypes()]);
  const sellable = rooms.filter((item) => item.opsStatus !== "ooo").sort((a, b) => a.number.localeCompare(b.number));
  const selected = sellable.find((item) => item.id === room) ?? sellable[0];
  const selectedType = types.find((type) => type.name === selected?.type);

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-x-3">
            <Link href={`/sales?date=${date}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
              ← Sơ đồ bán phòng
            </Link>
            <Link href="/sales/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
              Đặt phòng
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">Chọn hạng / phòng, ngày, ăn sáng và chiết khấu từng phòng. Khách chỉ thấy hạng phòng trên phiếu in.</p>
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {selected ? (
        <SaleForm
          action={createSaleAction}
          rooms={sellable}
          types={types}
          today={today}
          showCheckinNow
          allowMultiple
          submitLabel="Lưu đặt phòng"
          defaults={{
            roomId: selected.id,
            checkIn: date,
            checkOut: defaultCheckout(date),
            rate: catalogRate(selectedType, date),
            date,
          }}
        />
      ) : (
        <p className="text-sm">Không còn phòng bán được.</p>
      )}
    </main>
  );
}
