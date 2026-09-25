"use client";

import { Chip } from "@/components/ui";
import { formatDayMonth } from "@/lib/datetime";
import { roomTypeAvailability, type Room, type RoomType } from "./shared";

export function RoomTypeAvailability({
  rooms,
  types,
  busy,
  checkIn,
  checkOut,
}: {
  rooms: Room[];
  types: RoomType[];
  busy: { roomId: string; checkIn: string; checkOut: string }[];
  checkIn: string;
  checkOut: string;
}) {
  const rows = roomTypeAvailability(rooms, types, checkIn, checkOut, busy);
  const validRange = Boolean(checkIn && checkOut && checkOut > checkIn);
  const hasAvailability = rows.some((row) => row.available > 0);

  return (
    <section className="rounded-xl border border-line bg-[#fffaf2] p-3" aria-labelledby="room-type-availability-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="room-type-availability-title" className="text-sm font-bold">
            Kiểm tra nhanh hạng phòng
          </h2>
          <p className="mt-0.5 text-xs text-[#5c6665]">Số phòng còn trống cho cả kỳ và theo từng đêm.</p>
        </div>
        <Chip tone={!validRange ? "neutral" : hasAvailability ? "ok" : "danger"}>
          {!validRange ? "Chọn ngày" : hasAvailability ? "Còn phòng" : "Hết phòng"}
        </Chip>
      </div>

      {rows.length ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.type} className="rounded-lg border border-line bg-white p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">{row.type}</p>
                <Chip tone={row.available > 0 ? "ok" : "danger"}>
                  {row.available > 0 ? `Còn ${row.available}/${row.total} phòng cả kỳ` : `Hết phòng cả kỳ · 0/${row.total}`}
                </Chip>
              </div>
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {row.nights.map((night) => (
                  <span
                    key={night.date}
                    className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
                      night.available > 0 ? "bg-[#e4f5eb] text-[#1b7a4e]" : "bg-[#fde8e8] text-[#c23b3b]"
                    }`}
                    title={`${night.date}: ${night.available}/${row.total} phòng trống`}
                  >
                    {formatDayMonth(night.date)} · {night.available}/{row.total}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#c23b3b]">Chọn ngày nhận và ngày trả hợp lệ để kiểm tra.</p>
      )}
    </section>
  );
}
