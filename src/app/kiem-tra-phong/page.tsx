import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Chip } from "@/components/ui";
import { roomAvailabilityTable, roomTypeAvailability } from "@/components/sale-form/shared";
import { HOTEL_ADDRESS, HOTEL_NAME, HOTEL_PHONE } from "@/lib/constants";
import { WEEKDAYS, addDaysVN, formatDayMonth, formatDateLong, todayVN, weekdayISO } from "@/lib/datetime";
import { listRoomBusyRanges, listRooms, listRoomTypes } from "@/lib/repos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Kiểm tra phòng trống | ${HOTEL_NAME}`,
  description: `Kiểm tra nhanh hạng phòng còn trống theo ngày tại ${HOTEL_NAME}.`,
  robots: { index: false, follow: false },
};

function validDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function PublicRoomAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; roomType?: string }>;
}) {
  const params = await searchParams;
  const today = todayVN();
  const checkIn = validDate(params.checkIn) && params.checkIn! >= today ? params.checkIn! : today;
  const checkOut = validDate(params.checkOut) && params.checkOut! > checkIn ? params.checkOut! : addDaysVN(checkIn, 1);
  const [rooms, types, busy] = await Promise.all([listRooms(), listRoomTypes(), listRoomBusyRanges()]);
  const selectedType = types.some((type) => type.name === params.roomType) ? params.roomType! : "";
  const visibleRooms = selectedType ? rooms.filter((room) => room.type === selectedType) : rooms;
  const typeRows = roomTypeAvailability(visibleRooms, types, checkIn, checkOut, busy);
  const roomRows = roomAvailabilityTable(visibleRooms, types, checkIn, checkOut, busy);
  const nights = roomRows[0]?.nights.map((night) => night.date) || [];
  const availableTypes = typeRows.filter((row) => row.available > 0).length;
  const phoneHref = `tel:${HOTEL_PHONE.replace(/\D/g, "")}`;

  return (
    <div className="min-h-dvh bg-sand">
      <header className="border-b border-line bg-[#fff8ee]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/kiem-tra-phong" className="flex min-h-11 items-center gap-3">
            <div className="overflow-hidden rounded-lg bg-burgundy">
              <Logo priority className="h-11 w-[34px] object-cover object-[center_8%]" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy">{HOTEL_NAME}</p>
              <p className="text-sm font-semibold">Phòng trống</p>
            </div>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-burgundy">
            Đăng nhập
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 pb-16 md:py-10">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-burgundy">Kiểm tra nhanh</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">Hạng phòng còn trống theo ngày</h1>
          <p className="mt-2 text-sm leading-6 text-[#5c4a46]">
            Chọn ngày nhận và ngày trả để xem tình trạng phòng hiện tại. Ngày trả không tính là đêm ở.
          </p>
        </div>

        <form method="get" action="/kiem-tra-phong" className="card mt-5 grid gap-3 p-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_1fr_1fr_auto]">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Ngày nhận</span>
            <input name="checkIn" type="date" min={today} required defaultValue={checkIn} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Ngày trả</span>
            <input name="checkOut" type="date" min={addDaysVN(checkIn, 1)} required defaultValue={checkOut} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Hạng phòng</span>
            <select name="roomType" defaultValue={selectedType}>
              <option value="">Tất cả hạng phòng</option>
              {types.map((type) => (
                <option key={type.name} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <button className="inline-flex min-h-12 items-center justify-center rounded-xl bg-burgundy px-5 text-sm font-semibold text-white">
            Kiểm tra
          </button>
        </form>

        <section className="mt-5" aria-labelledby="availability-result-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="availability-result-title" className="text-lg font-bold">
                Kết quả phòng trống
              </h2>
              <p className="mt-0.5 text-xs text-[#5c6665]">
                {formatDateLong(checkIn)} → {formatDateLong(checkOut)}
              </p>
            </div>
            <Chip tone={availableTypes > 0 ? "ok" : "danger"}>
              {availableTypes > 0 ? `${availableTypes} hạng còn phòng` : "Không còn phòng"}
            </Chip>
          </div>

          <div className="card mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-[#f7edd2]">
                  <th className="sticky left-0 z-20 w-40 min-w-40 border-r border-line bg-[#f7edd2] px-3 py-2.5 text-left">
                    Hạng / số phòng
                  </th>
                  {nights.map((date) => (
                    <th key={date} className="min-w-24 border-r border-line px-3 py-2 text-center last:border-r-0">
                      <span className="block text-[11px] uppercase text-[#6b5a52]">
                        {WEEKDAYS.find((day) => day.iso === weekdayISO(date))?.short}
                      </span>
                      <span className="block whitespace-nowrap">{formatDayMonth(date)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {typeRows.map((typeRow) => {
                const groupRooms = roomRows.filter((room) => room.type === typeRow.type);
                return (
                  <tbody key={typeRow.type}>
                    <tr className="border-b border-line">
                      <th colSpan={nights.length + 1} className="bg-[#efe0c8] px-3 py-2.5 text-left">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-bold">{typeRow.type}</span>
                          <span className={`text-xs ${typeRow.available > 0 ? "text-[#1b7a4e]" : "text-[#c23b3b]"}`}>
                            {typeRow.available > 0 ? `Còn ${typeRow.available}/${typeRow.total} phòng cả kỳ` : "Hết phòng cả kỳ"}
                          </span>
                        </span>
                      </th>
                    </tr>
                    {groupRooms.map((room) => (
                      <tr key={room.roomId} className="border-b border-line last:border-b-0">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 w-40 min-w-40 border-r border-line bg-white px-3 py-2.5 text-left font-semibold"
                        >
                          P.{room.number}
                        </th>
                        {room.nights.map((night) => (
                          <td
                            key={night.date}
                            className={`border-r border-line px-3 py-2.5 text-center text-xs font-semibold last:border-r-0 ${
                              night.available ? "bg-[#e4f5eb] text-[#1b7a4e]" : "bg-[#fde8e8] text-[#c23b3b]"
                            }`}
                          >
                            {night.available ? "Trống" : "Đã đặt"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
          <p className="mt-2 text-xs text-[#5c6665]">Kéo ngang bảng để xem thêm ngày.</p>
        </section>

        <aside className="card mt-5 p-4">
          <p className="font-bold">Liên hệ lễ tân để giữ phòng</p>
          <p className="mt-1 text-sm leading-6 text-[#5c4a46]">
            Tình trạng trên là dữ liệu tham khảo tại thời điểm kiểm tra. Lễ tân sẽ xác nhận lại trước khi đặt phòng.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={phoneHref} className="inline-flex min-h-11 items-center rounded-xl bg-burgundy px-4 text-sm font-semibold text-white">
              Gọi {HOTEL_PHONE}
            </a>
            <span className="inline-flex min-h-11 items-center text-sm text-[#5c4a46]">{HOTEL_ADDRESS}</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
