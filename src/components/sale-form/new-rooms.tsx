"use client";

import { Field } from "@/components/ui";
import { formatVnd, isHolidayNight } from "@/lib/sales";
import { RoomDiscountFields } from "./discount";
import { emptyDiscount, type DiscountState, type Room, type StayDates } from "./shared";

export function SaleFormRooms(props: {
  allowMultiple?: boolean;
  openRooms: Room[];
  query: string;
  setQuery: (value: string) => void;
  typeGroups: { type: string; rooms: Room[] }[];
  roomIds: string[];
  toggleRoom: (id: string) => void;
  selectedRooms: Room[];
  filteredRooms: Room[];
  setRoomIds: (value: string[] | ((prev: string[]) => string[])) => void;
  sharedStay: StayDates;
  setStay: (roomId: string, patch: Partial<StayDates>) => void;
  catalogFor: (roomId: string, date: string) => number;
  setRoomRate: (roomId: string, value: string) => void;
  dates: Record<string, StayDates>;
  breakfast: Record<string, boolean>;
  setBreakfast: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  rates: Record<string, string>;
  discounts: Record<string, DiscountState>;
  setDiscounts: (value: Record<string, DiscountState> | ((prev: Record<string, DiscountState>) => Record<string, DiscountState>)) => void;
  typeByName: Record<string, { weekendRate?: number }>;
}) {
  const {
    allowMultiple,
    openRooms,
    query,
    setQuery,
    typeGroups,
    roomIds,
    toggleRoom,
    selectedRooms,
    filteredRooms,
    setRoomIds,
    sharedStay,
    setStay,
    catalogFor,
    setRoomRate,
    dates,
    breakfast,
    setBreakfast,
    rates,
    discounts,
    setDiscounts,
    typeByName,
  } = props;
  return (
    <>
      {allowMultiple ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#5c6665]">
            Phòng trống · {openRooms.length} phòng
          </p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng / số phòng" />
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-2 md:max-h-56">
            {typeGroups.length ? (
              typeGroups.map((group) => (
                <div key={group.type}>
                  <p className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">{group.type}</p>
                  <div className="grid grid-cols-2 gap-1 md:grid-cols-4 lg:grid-cols-5">
                    {group.rooms.map((room) => (
                      <label key={room.id} className="min-h-11 gap-2 rounded-lg px-2 py-1">
                        <input type="checkbox" name="roomId" value={room.id} checked={roomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                        <span className="text-sm font-semibold">P.{room.number}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="px-1 py-2 text-sm text-[#5c6665]">Không còn phòng trống cho ngày này.</p>
            )}
          </div>
          {roomIds.length ? (
            <p className="mt-1 text-xs text-[#5c6665]">
              Đã chọn {roomIds.length} phòng
              {selectedRooms.length ? `: ${[...new Set(selectedRooms.map((room) => room.type))].join(", ")}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-[#c23b3b]">Chọn ít nhất một phòng</p>
          )}
        </div>
      ) : (
        <Field label="Phòng trống">
          <select
            name="roomId"
            required
            value={roomIds[0] || ""}
            onChange={(e) => {
              const next = e.target.value;
              setRoomIds(next ? [next] : []);
              if (!next) return;
              setStay(next, sharedStay);
              const value = catalogFor(next, sharedStay.checkIn);
              if (value) setRoomRate(next, String(value));
            }}
          >
            <option value="">Chọn phòng</option>
            {filteredRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.type} · P.{room.number}
              </option>
            ))}
          </select>
        </Field>
      )}

      {selectedRooms.length ? (
        <div className="sale-rooms space-y-2">
          <p className="text-xs font-semibold text-[#5c6665] md:hidden">Thông tin phòng</p>
          <div className="sale-rooms-head">
            <span>Phòng</span>
            <span>Ngày</span>
            <span>Giá / đêm</span>
            <span>Chiết khấu</span>
          </div>
          {selectedRooms.map((room) => {
            const stay = dates[room.id] || sharedStay;
            const eats = breakfast[room.id] !== false;
            const catalog = catalogFor(room.id, stay.checkIn);
            const peakRate = isHolidayNight(stay.checkIn) && Boolean(typeByName[room.type]?.weekendRate);
            return (
              <div key={room.id} className="sale-room rounded-xl border border-line p-3">
                <p className="font-bold">
                  {room.type}
                  <span className="ml-2 text-xs font-semibold text-[#8a7a72]">P.{room.number}</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Nhận">
                    <input
                      name={`checkIn-${room.id}`}
                      type="date"
                      required
                      value={stay.checkIn}
                      onChange={(e) => {
                        const next = e.target.value;
                        setStay(room.id, { checkIn: next });
                        const value = catalogFor(room.id, next);
                        if (value) setRoomRate(room.id, String(value));
                      }}
                    />
                  </Field>
                  <Field label="Trả">
                    <input
                      name={`checkOut-${room.id}`}
                      type="date"
                      required
                      value={stay.checkOut}
                      onChange={(e) => setStay(room.id, { checkOut: e.target.value })}
                    />
                  </Field>
                </div>
                <label className="sale-room-bf flex items-center gap-2">
                  <input type="hidden" name={`breakfast-${room.id}`} value="0" />
                  <input
                    type="checkbox"
                    name={`breakfast-${room.id}`}
                    value="1"
                    checked={eats}
                    onChange={(e) => setBreakfast((prev) => ({ ...prev, [room.id]: e.target.checked }))}
                  />
                  <span>Ăn sáng</span>
                </label>
                <div className="sale-room-rate">
                  <Field label="Giá / đêm (₫)">
                    <input
                      name={`rate-${room.id}`}
                      inputMode="numeric"
                      value={rates[room.id] || ""}
                      onChange={(e) => setRoomRate(room.id, e.target.value)}
                      placeholder="800000"
                    />
                  </Field>
                  {catalog ? (
                    <p className="sale-room-hint text-xs text-[#5c6665]">
                      Giá bảng {peakRate ? "lễ tết" : "ngày thường"}: {formatVnd(catalog)}
                    </p>
                  ) : (
                    <p className="sale-room-hint text-xs text-[#5c6665]">Chưa có giá bảng — nhập giá bán.</p>
                  )}
                </div>
                <RoomDiscountFields
                  namePrefix={room.id}
                  discount={discounts[room.id] || emptyDiscount()}
                  onChange={(next) => setDiscounts((prev) => ({ ...prev, [room.id]: next }))}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
