"use client";

import { useMemo, useState } from "react";
import { Btn, Field } from "@/components/ui";
import { DISCOUNT_KIND_LABEL, SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import {
  BREAKFAST_NIGHT_DEDUCT,
  bookingDue,
  bookingQuote,
  catalogRate,
  defaultCheckout,
  formatVnd,
  isWeekendNight,
  parseMoney,
  rangesOverlap,
  roomMoveKind,
} from "@/lib/sales";
import { extraAmount } from "@/lib/extras";
import { DISCOUNT_KINDS, type DiscountKind } from "@/lib/types";

type Room = { id: string; number: string; type: string; floor?: number };
type RoomType = { name: string; sortOrder: number; baseRate: number; weekendRate: number };
type StayDates = { checkIn: string; checkOut: string };

function groupRoomsByType(rooms: Room[], types: RoomType[]) {
  const order = new Map(types.map((type, index) => [type.name, type.sortOrder || index]));
  const groups = new Map<string, Room[]>();
  for (const room of rooms) {
    const list = groups.get(room.type) || [];
    list.push(room);
    groups.set(room.type, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
    .map(([type, items]) => ({ type, rooms: items.sort((a, b) => a.number.localeCompare(b.number)) }));
}

export function SaleForm({
  action,
  rooms,
  types,
  defaults,
  submitLabel,
  showCheckinNow,
  today,
  allowMultiple,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rooms: Room[];
  types: RoomType[];
  defaults: {
    id?: string;
    roomId?: string;
    guestName?: string;
    guestPhone?: string;
    source?: string;
    origin?: string;
    checkIn: string;
    checkOut: string;
    adults?: number;
    children?: number;
    rate?: number;
    discountKind?: string;
    discountValue?: number;
    deposit?: number;
    pmsCode?: string;
    notes?: string;
    date?: string;
  };
  submitLabel: string;
  showCheckinNow?: boolean;
  today?: string;
  allowMultiple?: boolean;
}) {
  const typeByName = useMemo(() => Object.fromEntries(types.map((type) => [type.name, type])), [types]);
  const initialId = defaults.roomId || rooms[0]?.id || "";
  const [roomIds, setRoomIds] = useState<string[]>(initialId ? [initialId] : []);
  const [query, setQuery] = useState("");
  const [dates, setDates] = useState<Record<string, StayDates>>(() =>
    initialId ? { [initialId]: { checkIn: defaults.checkIn, checkOut: defaults.checkOut } } : {},
  );
  const [breakfast, setBreakfast] = useState<Record<string, boolean>>(() => (initialId ? { [initialId]: true } : {}));
  const [rates, setRates] = useState<Record<string, string>>(() => {
    const room = rooms.find((item) => item.id === initialId);
    const next = catalogRate(typeByName[room?.type || ""], defaults.checkIn);
    return initialId ? { [initialId]: String(defaults.rate ?? next ?? "") } : {};
  });
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    defaults.discountKind === "percent" || defaults.discountKind === "amount" ? defaults.discountKind : "none",
  );
  const [discountValue, setDiscountValue] = useState(defaults.discountValue ? String(defaults.discountValue) : "");
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");
  const [fromEz, setFromEz] = useState(defaults.origin === "ezcloud");
  const selectedRooms = rooms.filter((room) => roomIds.includes(room.id));
  const quoteInputs = selectedRooms.map((room) => {
    const stay = dates[room.id] || { checkIn: defaults.checkIn, checkOut: defaults.checkOut };
    return {
      room,
      rate: parseMoney(rates[room.id]),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      breakfast: breakfast[room.id] !== false,
      discountKind,
      discountValue: parseMoney(discountValue),
    };
  });
  const booked = bookingQuote(quoteInputs);
  const quotes = quoteInputs.map((row, index) => ({ ...row, quote: booked.lines[index] }));
  const bookingTotal = booked.total;
  const bookingDiscount = booked.discount;
  const depositAmount = parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);
  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => `p.${room.number} ${room.number} ${room.type}`.toLowerCase().includes(q));
  }, [rooms, query]);
  const typeGroups = groupRoomsByType(filteredRooms, types);

  function catalogFor(roomId: string, date: string) {
    const room = rooms.find((item) => item.id === roomId);
    return catalogRate(typeByName[room?.type || ""], date);
  }

  function setRoomRate(roomId: string, value: string) {
    setRates((prev) => ({ ...prev, [roomId]: value }));
  }

  function setStay(roomId: string, patch: Partial<StayDates>) {
    setDates((prev) => {
      const current = prev[roomId] || { checkIn: defaults.checkIn, checkOut: defaults.checkOut };
      const next = { ...current, ...patch };
      if (next.checkOut <= next.checkIn) next.checkOut = defaultCheckout(next.checkIn);
      return { ...prev, [roomId]: next };
    });
  }

  function toggleRoom(id: string) {
    setRoomIds((prev) => {
      const on = prev.includes(id);
      const next = on ? prev.filter((item) => item !== id) : [...prev, id];
      if (!on) {
        const checkIn = defaults.checkIn;
        setStay(id, { checkIn, checkOut: defaultCheckout(checkIn) });
        setBreakfast((prevBreakfast) => ({ ...prevBreakfast, [id]: true }));
        const value = catalogFor(id, checkIn);
        if (value) setRoomRate(id, String(value));
      }
      return next;
    });
  }

  const saveLabel = allowMultiple && roomIds.length > 1 ? `Lưu ${roomIds.length} phòng` : submitLabel;

  return (
    <form action={action} className="sale-form-desk space-y-3">
      <div className="sale-form-main card p-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults.date ? <input type="hidden" name="date" value={defaults.date} /> : null}
      <Field label="Nền tảng">
        <select name="source" defaultValue={defaults.source || "walk_in"}>
          {SALE_SOURCE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.values.map((source) => (
                <option key={source} value={source}>
                  {SALE_SOURCE_LABEL[source]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="fromEzcloud" value="1" checked={fromEz} onChange={(e) => setFromEz(e.target.checked)} />
        <span>Từ ezCloud</span>
      </label>
      {allowMultiple ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#5c6665]">Hạng phòng · chọn 1 hoặc nhiều phòng</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng / số phòng" />
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-2 md:max-h-56">
            {typeGroups.map((group) => (
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
            ))}
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
        <Field label="Phòng">
          <select
            name="roomId"
            required
            value={roomIds[0] || ""}
            onChange={(e) => {
              const next = e.target.value;
              setRoomIds([next]);
              const value = catalogFor(next, dates[next]?.checkIn || defaults.checkIn);
              if (value) setRoomRate(next, String(value));
            }}
          >
            {rooms.map((room) => (
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
          </div>
          {selectedRooms.map((room) => {
            const stay = dates[room.id] || { checkIn: defaults.checkIn, checkOut: defaults.checkOut };
            const eats = breakfast[room.id] !== false;
            const catalog = catalogFor(room.id, stay.checkIn);
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
                <div>
                  <Field label="Giá / đêm (₫)">
                    <input
                      name={`rate-${room.id}`}
                      inputMode="numeric"
                      value={rates[room.id] || ""}
                      onChange={(e) => setRoomRate(room.id, e.target.value)}
                      placeholder="800000"
                    />
                  </Field>
                  {!eats ? (
                    <p className="sale-room-hint text-xs text-[#c47b12]">Không ăn sáng: trừ {formatVnd(BREAKFAST_NIGHT_DEDUCT)}/đêm trước chiết khấu</p>
                  ) : catalog ? (
                    <p className="sale-room-hint text-xs text-[#5c6665]">
                      Giá bảng {isWeekendNight(stay.checkIn) ? "cuối tuần" : "ngày thường"}: {formatVnd(catalog)}
                    </p>
                  ) : (
                    <p className="sale-room-hint text-xs text-[#5c6665]">Chưa có giá bảng — nhập giá bán.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      </div>

      <div className="sale-form-side card p-4">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Chiết khấu · tổng booking">
          <select name="discountKind" value={discountKind} onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}>
            {DISCOUNT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DISCOUNT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={discountKind === "percent" ? "Mức %" : "Số tiền (₫)"}>
          <input
            name="discountValue"
            inputMode="numeric"
            value={discountKind === "none" ? "" : discountValue}
            disabled={discountKind === "none"}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountKind === "percent" ? "10" : "0"}
          />
        </Field>
      </div>
      <p className="text-xs text-[#5c6665]">Chiết khấu tính trên tổng booking, sau khi trừ không ăn sáng.</p>
      <Field label="Đặt cọc (₫)">
        <input name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
      </Field>
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        {selectedRooms.length && quotes.every((row) => row.quote.nights > 0) ? (
          <ul className="space-y-1">
            {quotes.map((row) => (
              <li key={row.room.id}>
                <div className="flex justify-between gap-2">
                  <span>
                    {row.room.type} · {row.quote.nights} đêm × {formatVnd(row.rate)}
                  </span>
                  <span>{formatVnd(row.quote.subtotal + row.quote.breakfastOff)}</span>
                </div>
                {row.quote.breakfastOff ? (
                  <div className="flex justify-between gap-2 text-xs text-[#c47b12]">
                    <span>Không ăn sáng</span>
                    <span>−{formatVnd(row.quote.breakfastOff)}</span>
                  </div>
                ) : null}
              </li>
            ))}
            {bookingDiscount ? (
              <li className="flex justify-between gap-2 text-[#1b7a4e]">
                <span>Chiết khấu{discountKind === "percent" ? ` ${parseMoney(discountValue)}%` : ""} · tổng booking</span>
                <span>−{formatVnd(bookingDiscount)}</span>
              </li>
            ) : null}
            <li className="flex justify-between gap-2">
              <span>{quotes.length > 1 ? `Phải thu ${quotes.length} phòng` : "Phải thu"}</span>
              <span>{formatVnd(bookingTotal)}</span>
            </li>
            {depositAmount ? (
              <li className="flex justify-between gap-2 text-[#1b7a4e]">
                <span>Đã đặt cọc</span>
                <span>−{formatVnd(depositAmount)}</span>
              </li>
            ) : (
              <li className="text-[#c47b12]">Chưa đặt cọc</li>
            )}
            <li className="flex justify-between gap-2 font-bold">
              <span>Còn phải thu</span>
              <span>{formatVnd(due)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-[#5c6665]">{selectedRooms.length ? "Ngày trả phải sau ngày nhận" : "Chọn phòng để xem tạm tính"}</p>
        )}
      </div>

      <p className="text-xs font-semibold text-[#5c6665]">Thông tin khách</p>
      <Field label="Họ tên">
        <input name="guestName" required defaultValue={defaults.guestName || ""} placeholder="Nguyễn Văn A" />
      </Field>
      <Field label="SĐT">
        <input name="guestPhone" type="tel" defaultValue={defaults.guestPhone || ""} placeholder="090..." />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input name="adults" type="number" min={1} defaultValue={defaults.adults ?? 1} />
        </Field>
        <Field label="Trẻ em">
          <input name="children" type="number" min={0} defaultValue={defaults.children ?? 0} />
        </Field>
      </div>
      <Field label={fromEz ? "Mã PMS ezCloud" : "Mã PMS (nếu có)"}>
        <input
          name="pmsCode"
          defaultValue={defaults.pmsCode || ""}
          required={fromEz}
          placeholder={fromEz ? "EZ-..." : "Để trống — Ops cấp Bk-1/09"}
        />
      </Field>
      <Field label="Ghi chú">
        <textarea name="notes" rows={2} defaultValue={defaults.notes || ""} placeholder="Giờ đến, giường, xe đón..." />
      </Field>
      {showCheckinNow ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="checkinNow" value="1" defaultChecked={Boolean(today && defaults.checkIn <= today)} />
          <span>Nhận phòng luôn (phòng đã đến ngày)</span>
        </label>
      ) : null}
      <Btn type="submit" className="w-full" disabled={!roomIds.length}>
        {saveLabel}
      </Btn>
      </div>
    </form>
  );
}

export function BookingForm({
  action,
  lines,
  rooms,
  types,
  busy = [],
  extras = [],
  defaults,
}: {
  action: (formData: FormData) => void | Promise<void>;
  lines: {
    saleId: string;
    roomId: string;
    number: string;
    type: string;
    rate: number;
    checkIn: string;
    checkOut: string;
    breakfast?: boolean;
    status?: string;
  }[];
  rooms: { id: string; number: string; type: string; opsStatus?: string }[];
  types: { name: string; sortOrder: number; baseRate: number; weekendRate: number }[];
  busy?: { roomId: string; checkIn: string; checkOut: string }[];
  extras?: { name: string; qty: number; unitPrice: number; unit: string }[];
  defaults: {
    bookingId: string;
    guestName?: string;
    guestPhone?: string;
    source?: string;
    adults?: number;
    children?: number;
    discountKind?: string;
    discountValue?: number;
    deposit?: number;
    notes?: string;
  };
}) {
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.saleId, line.roomId])),
  );
  const [dates, setDates] = useState<Record<string, StayDates>>(() =>
    Object.fromEntries(lines.map((line) => [line.saleId, { checkIn: line.checkIn, checkOut: line.checkOut }])),
  );
  const [breakfast, setBreakfast] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lines.map((line) => [line.saleId, line.breakfast !== false])),
  );
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    defaults.discountKind === "percent" || defaults.discountKind === "amount" ? defaults.discountKind : "none",
  );
  const [discountValue, setDiscountValue] = useState(defaults.discountValue ? String(defaults.discountValue) : "");
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");

  function stayOf(saleId: string, fallback: StayDates) {
    return dates[saleId] || fallback;
  }

  function optionsFor(line: (typeof lines)[number]) {
    const stay = stayOf(line.saleId, { checkIn: line.checkIn, checkOut: line.checkOut });
    return rooms
      .filter((room) => {
        if (room.id !== line.roomId && room.opsStatus === "ooo") return false;
        if (
          room.id !== line.roomId &&
          busy.some((row) => row.roomId === room.id && rangesOverlap(stay.checkIn, stay.checkOut, row.checkIn, row.checkOut))
        ) {
          return false;
        }
        return Boolean(roomMoveKind(line.type, room.type, types));
      })
      .sort((a, b) => {
        const kindA = roomMoveKind(line.type, a.type, types);
        const kindB = roomMoveKind(line.type, b.type, types);
        if (kindA !== kindB) return kindA === "same" ? -1 : 1;
        return a.number.localeCompare(b.number);
      });
  }

  const quoteInputs = lines.map((line) => {
    const roomId = picks[line.saleId] || line.roomId;
    const room = rooms.find((item) => item.id === roomId);
    const stay = stayOf(line.saleId, { checkIn: line.checkIn, checkOut: line.checkOut });
    const kind = roomMoveKind(line.type, room?.type || line.type, types);
    const rate =
      kind === "upgrade" ? catalogRate(types.find((type) => type.name === room?.type), stay.checkIn) || line.rate : line.rate;
    return {
      line,
      room,
      kind,
      rate,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      breakfast: breakfast[line.saleId] !== false,
    };
  });
  const booked = bookingQuote(
    quoteInputs.map((row) => ({
      rate: row.rate,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      breakfast: row.breakfast,
      discountKind,
      discountValue: parseMoney(discountValue),
    })),
  );
  const quotes = quoteInputs.map((row, index) => ({
    ...row,
    quote: booked.lines[index],
  }));
  const extraRows = extras.map((row) => ({ ...row, amount: extraAmount(row, booked.nights) }));
  const extrasTotal = extraRows.reduce((sum, row) => sum + row.amount, 0);
  const bookingTotal = booked.total + extrasTotal;
  const bookingDiscount = booked.discount;
  const depositAmount = parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookingId" value={defaults.bookingId} />
      <p className="text-xs font-semibold text-[#5c6665]">Thông tin khách</p>
      <Field label="Họ tên">
        <input name="guestName" required defaultValue={defaults.guestName || ""} placeholder="Nguyễn Văn A" />
      </Field>
      <Field label="SĐT">
        <input name="guestPhone" type="tel" defaultValue={defaults.guestPhone || ""} placeholder="090..." />
      </Field>
      <Field label="Nền tảng">
        <select name="source" defaultValue={defaults.source || "walk_in"}>
          {SALE_SOURCE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.values.map((source) => (
                <option key={source} value={source}>
                  {SALE_SOURCE_LABEL[source]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input name="adults" type="number" min={1} defaultValue={defaults.adults ?? 1} />
        </Field>
        <Field label="Trẻ em">
          <input name="children" type="number" min={0} defaultValue={defaults.children ?? 0} />
        </Field>
      </div>
      {lines.map((line) => {
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
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Chiết khấu">
          <select name="discountKind" value={discountKind} onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}>
            {DISCOUNT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DISCOUNT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={discountKind === "percent" ? "Mức %" : "Số tiền (₫)"}>
          <input
            name="discountValue"
            inputMode="numeric"
            value={discountKind === "none" ? "" : discountValue}
            disabled={discountKind === "none"}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountKind === "percent" ? "10" : "0"}
          />
        </Field>
      </div>
      <Field label="Đặt cọc — tổng đã thu (₫)">
        <input name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Ghi chú">
        <textarea name="notes" rows={2} defaultValue={defaults.notes || ""} placeholder="Giờ đến, giường, xe đón..." />
      </Field>
      <p className="text-xs text-[#5c6665]">Sửa tên, SĐT, số khách, kênh. Đổi số phòng cùng hạng hoặc nâng hạng. Ngày và ăn sáng theo từng phòng. Chiết khấu theo tổng booking.</p>
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        <ul className="space-y-1">
          {quotes.map((row) => (
            <li key={row.line.saleId}>
              <div className="flex justify-between gap-2">
                <span>
                  {row.room?.type || row.line.type}
                  {row.kind === "upgrade" ? ` · nâng` : ""} · {row.quote.nights} đêm
                </span>
                <span>{formatVnd(row.quote.subtotal)}</span>
              </div>
              {row.quote.breakfastOff ? (
                <div className="text-xs text-[#c47b12]">Không ăn sáng −{formatVnd(row.quote.breakfastOff)}</div>
              ) : null}
            </li>
          ))}
          {bookingDiscount ? (
            <li className="flex justify-between gap-2 text-[#1b7a4e]">
              <span>Chiết khấu{discountKind === "percent" ? ` ${parseMoney(discountValue)}%` : ""}{quotes.length > 1 ? " · tổng booking" : ""}</span>
              <span>−{formatVnd(bookingDiscount)}</span>
            </li>
          ) : null}
          {extraRows.map((row) => (
            <li key={`${row.name}-${row.qty}-${row.unitPrice}`} className="flex justify-between gap-2">
              <span>
                {row.name}
                {row.unit === "night" ? ` · ${row.qty} × ${booked.nights} đêm` : row.unit === "kg" ? ` · ${row.qty} kg` : ""}
              </span>
              <span>{formatVnd(row.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2">
            <span>Phải thu</span>
            <span>{formatVnd(bookingTotal)}</span>
          </li>
          {depositAmount ? (
            <li className="flex justify-between gap-2 text-[#1b7a4e]">
              <span>Đã đặt cọc</span>
              <span>−{formatVnd(depositAmount)}</span>
            </li>
          ) : (
            <li className="text-[#c47b12]">Chưa đặt cọc</li>
          )}
          <li className="flex justify-between gap-2 font-bold">
            <span>Còn phải thu</span>
            <span>{formatVnd(due)}</span>
          </li>
        </ul>
      </div>
      <Btn type="submit" className="w-full">
        Lưu booking
      </Btn>
    </form>
  );
}

export function AddBookingRoomsForm({
  action,
  rooms,
  saleId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rooms: Room[];
  saleId: string;
}) {
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => `p.${room.number} ${room.number} ${room.type}`.toLowerCase().includes(q));
  }, [rooms, query]);
  const groups = groupRoomsByType(filtered, []);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={saleId} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng / số phòng" />
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-line p-2">
        {groups.map((group) => (
          <div key={group.type}>
            <p className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">{group.type}</p>
            {group.rooms.map((room) => (
              <label key={room.id} className="min-h-11 gap-2 rounded-lg px-2 py-1">
                <input
                  type="checkbox"
                  name="roomId"
                  value={room.id}
                  checked={roomIds.includes(room.id)}
                  onChange={() => setRoomIds((prev) => (prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id]))}
                />
                <span className="text-sm font-semibold">P.{room.number}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <Btn type="submit" className="w-full" disabled={!roomIds.length}>
        {roomIds.length > 1 ? `Thêm ${roomIds.length} phòng` : "Thêm phòng vào booking"}
      </Btn>
    </form>
  );
}
