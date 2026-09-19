"use client";

import { Field } from "@/components/ui";
import { defaultCheckout, roomMoveKind } from "@/lib/sales";
import { RoomDiscountFields } from "./discount";
import { emptyDiscount, type DiscountState, type StayDates } from "./shared";

type Line = {
  saleId: string;
  roomId: string;
  number: string;
  type: string;
  rate: number;
  checkIn: string;
  checkOut: string;
  breakfast?: boolean;
  discountKind?: string;
  discountValue?: number;
  status?: string;
};

export function BookingRoomLines(props: {
  lines: Line[];
  types: { name: string; sortOrder: number; baseRate: number; weekendRate: number }[];
  picks: Record<string, string>;
  setPicks: (value: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  dates: Record<string, StayDates>;
  setDates: (value: Record<string, StayDates> | ((prev: Record<string, StayDates>) => Record<string, StayDates>)) => void;
  breakfast: Record<string, boolean>;
  setBreakfast: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  discounts: Record<string, DiscountState>;
  setDiscounts: (value: Record<string, DiscountState> | ((prev: Record<string, DiscountState>) => Record<string, DiscountState>)) => void;
  optionsFor: (line: Line) => { id: string; number: string; type: string }[];
  stayOf: (saleId: string, fallback: StayDates) => StayDates;
}) {
  const { lines, types, picks, setPicks, setDates, breakfast, setBreakfast, discounts, setDiscounts, optionsFor, stayOf } = props;
  return (
    <>
      {lines.map((line, index) => {
        const options = optionsFor(line);
        const same = options.filter((room) => roomMoveKind(line.type, room.type, types) === "same");
        const upgrades = options.filter((room) => roomMoveKind(line.type, room.type, types) === "upgrade");
        const taken = new Set(Object.entries(picks).filter(([saleId]) => saleId !== line.saleId).map(([, roomId]) => roomId));
        const stay = stayOf(line.saleId, { checkIn: line.checkIn, checkOut: line.checkOut });
        const canEditCheckIn = line.status !== "inhouse";
        const eats = breakfast[line.saleId] !== false;
        return (
          <div key={line.saleId} className="space-y-2 rounded-xl border border-line p-3">
            <input type="hidden" name="saleId" value={line.saleId} />
            <p className="font-bold">
              {line.type}
              <span className="ml-2 text-xs font-semibold text-[#8a7a72]">P.{line.number}</span>
            </p>
            <Field label="Đổi phòng">
              <select
                name={`room-${line.saleId}`}
                value={picks[line.saleId] || line.roomId}
                onChange={(e) => setPicks((prev) => ({ ...prev, [line.saleId]: e.target.value }))}
              >
                <optgroup label="Cùng hạng">
                  {same.map((room) => (
                    <option key={room.id} value={room.id} disabled={taken.has(room.id)}>
                      P.{room.number}
                      {room.id === line.roomId ? " · hiện tại" : ""}
                    </option>
                  ))}
                </optgroup>
                {upgrades.length ? (
                  <optgroup label="Nâng hạng">
                    {upgrades.map((room) => (
                      <option key={room.id} value={room.id} disabled={taken.has(room.id)}>
                        P.{room.number} · {room.type}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nhận">
                {canEditCheckIn ? (
                  <input
                    name={`checkIn-${line.saleId}`}
                    type="date"
                    required
                    value={stay.checkIn}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDates((prev) => {
                        const current = prev[line.saleId] || stay;
                        return { ...prev, [line.saleId]: { ...current, checkIn: next, checkOut: current.checkOut <= next ? defaultCheckout(next) : current.checkOut } };
                      });
                    }}
                  />
                ) : (
                  <>
                    <input type="hidden" name={`checkIn-${line.saleId}`} value={stay.checkIn} />
                    <input type="date" value={stay.checkIn} disabled />
                  </>
                )}
              </Field>
              <Field label="Trả">
                <input
                  name={`checkOut-${line.saleId}`}
                  type="date"
                  required
                  value={stay.checkOut}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, [line.saleId]: { ...(prev[line.saleId] || stay), checkOut: e.target.value } }))
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-2">
              <input type="hidden" name={`breakfast-${line.saleId}`} value="0" />
              <input
                type="checkbox"
                name={`breakfast-${line.saleId}`}
                value="1"
                checked={eats}
                onChange={(e) => setBreakfast((prev) => ({ ...prev, [line.saleId]: e.target.checked }))}
              />
              <span>Ăn sáng</span>
            </label>
            <RoomDiscountFields
              namePrefix={line.saleId}
              discount={discounts[line.saleId] || emptyDiscount()}
              onChange={(next) => setDiscounts((prev) => ({ ...prev, [line.saleId]: next }))}
            />
          </div>
        );
      })}
    </>
  );
}
