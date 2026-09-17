"use client";

import { useMemo, useState } from "react";
import { Btn, Field } from "@/components/ui";
import { DISCOUNT_KIND_LABEL, SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import { bookingDue, bookingQuote, catalogRate, defaultCheckout, formatVnd, isWeekendNight, parseMoney, rangesOverlap, roomMoveKind } from "@/lib/sales";
import { extraAmount } from "@/lib/extras";
import { DISCOUNT_KINDS, type DiscountKind } from "@/lib/types";

type Room = { id: string; number: string; type: string; floor?: number };
type RoomType = { name: string; baseRate: number; weekendRate: number };

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
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
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
  const quoteInputs = selectedRooms.map((room) => ({
    rate: parseMoney(rates[room.id]),
    checkIn,
    checkOut,
    discountKind,
    discountValue: parseMoney(discountValue),
  }));
  const booked = bookingQuote(quoteInputs);
  const quotes = selectedRooms.map((room, index) => ({
    room,
    rate: quoteInputs[index].rate,
    quote: booked.lines[index],
  }));
  const bookingTotal = booked.total;
  const bookingSubtotal = booked.subtotal;
  const bookingDiscount = booked.discount;
  const nights = booked.nights;
  const depositAmount = parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);
  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => `p.${room.number} ${room.number} ${room.type}`.toLowerCase().includes(q));
  }, [rooms, query]);
  const floors = [...new Set(filteredRooms.map((room) => room.floor ?? 0))].sort((a, b) => a - b);

  function catalogFor(roomId: string, date: string) {
    const room = rooms.find((item) => item.id === roomId);
    return catalogRate(typeByName[room?.type || ""], date);
  }

  function setRoomRate(roomId: string, value: string) {
    setRates((prev) => ({ ...prev, [roomId]: value }));
  }

  function applyCatalog(ids: string[], date: string) {
    setRates((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const value = catalogFor(id, date);
        if (value) next[id] = String(value);
      }
      return next;
    });
  }

  function toggleRoom(id: string) {
    setRoomIds((prev) => {
      const on = prev.includes(id);
      const next = on ? prev.filter((item) => item !== id) : [...prev, id];
      if (!on && !rates[id]) {
        const value = catalogFor(id, checkIn);
        if (value) setRoomRate(id, String(value));
      }
      return next;
    });
  }

  const saveLabel = allowMultiple && roomIds.length > 1 ? `Lưu ${roomIds.length} phòng` : submitLabel;

  return (
    <form action={action} className="space-y-3">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults.date ? <input type="hidden" name="date" value={defaults.date} /> : null}
      {allowMultiple ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#5c6665]">Phòng · chọn nhiều cho cùng booking</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm số phòng / hạng" />
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-line p-2">
            {floors.map((floor) => (
              <div key={floor}>
                <p className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">Tầng {floor}</p>
                {filteredRooms
                  .filter((room) => (room.floor ?? 0) === floor)
                  .map((room) => (
                    <label key={room.id} className="min-h-11 gap-2 rounded-lg px-2 py-1">
                      <input type="checkbox" name="roomId" value={room.id} checked={roomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                      <span className="text-sm font-semibold">
                        P.{room.number} · {room.type}
                      </span>
                    </label>
                  ))}
              </div>
            ))}
          </div>
          {roomIds.length ? (
            <p className="mt-1 text-xs text-[#5c6665]">
              Đã chọn {roomIds.length} phòng
              {selectedRooms.length ? `: ${selectedRooms.map((room) => `P.${room.number}`).join(", ")}` : ""}
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
              applyCatalog([next], checkIn);
            }}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                P.{room.number} · {room.type}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Tên khách">
        <input name="guestName" required defaultValue={defaults.guestName || ""} placeholder="Nguyễn Văn A" />
      </Field>
      <Field label="Số điện thoại">
        <input name="guestPhone" type="tel" defaultValue={defaults.guestPhone || ""} placeholder="090..." />
      </Field>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="fromEzcloud"
          value="1"
          checked={fromEz}
          onChange={(e) => setFromEz(e.target.checked)}
        />
        <span>Từ ezCloud</span>
      </label>
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
        <Field label="Nhận phòng">
          <input
            name="checkIn"
            type="date"
            required
            value={checkIn}
            onChange={(e) => {
              const next = e.target.value;
              setCheckIn(next);
              if (checkOut <= next) setCheckOut(defaultCheckout(next));
              applyCatalog(roomIds, next);
            }}
          />
        </Field>
        <Field label="Trả phòng">
          <input name="checkOut" type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input name="adults" type="number" min={1} defaultValue={defaults.adults ?? 1} />
        </Field>
        <Field label="Trẻ em">
          <input name="children" type="number" min={0} defaultValue={defaults.children ?? 0} />
        </Field>
      </div>
      {selectedRooms.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#5c6665]">Giá / đêm (₫) · từng phòng</p>
          {selectedRooms.map((room) => (
            <Field key={room.id} label={`P.${room.number} · ${room.type}`}>
              <input
                name={`rate-${room.id}`}
                inputMode="numeric"
                value={rates[room.id] || ""}
                onChange={(e) => setRoomRate(room.id, e.target.value)}
                placeholder="800000"
              />
            </Field>
          ))}
        </div>
      ) : (
        <Field label="Giá / đêm (₫)">
          <input
            name={selectedRooms[0] ? `rate-${selectedRooms[0].id}` : "rate"}
            inputMode="numeric"
            value={rates[selectedRooms[0]?.id || ""] || ""}
            onChange={(e) => selectedRooms[0] && setRoomRate(selectedRooms[0].id, e.target.value)}
            placeholder="800000"
          />
        </Field>
      )}
      {selectedRooms.length === 1 && catalogFor(selectedRooms[0].id, checkIn) ? (
        <p className="text-xs text-[#5c6665]">
          Giá bảng {isWeekendNight(checkIn) ? "cuối tuần" : "ngày thường"}: {formatVnd(catalogFor(selectedRooms[0].id, checkIn))}
          {` · ${selectedRooms[0].type}`}
        </p>
      ) : selectedRooms.length > 1 ? (
          <p className="text-xs text-[#5c6665]">Giá mặc định theo bảng hạng từng phòng. Chiết khấu tính trên tổng booking.</p>
      ) : (
        <p className="text-xs text-[#5c6665]">Chưa có giá bảng — nhập giá bán. Chỉ quản lý sửa giá hạng.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Chiết khấu">
          <select
            name="discountKind"
            value={discountKind}
            onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
          >
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
      <Field label="Đặt cọc (₫)">
        <input name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
      </Field>
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        {nights > 0 && selectedRooms.length ? (
          <ul className="space-y-1">
            {quotes.map((row) => (
              <li key={row.room.id} className="flex justify-between gap-2">
                <span>
                  P.{row.room.number} · {nights} đêm × {formatVnd(row.rate)}
                </span>
                <span>{formatVnd(row.quote.subtotal)}</span>
              </li>
            ))}
            {bookingDiscount ? (
              <li className="flex justify-between gap-2 text-[#1b7a4e]">
                <span>Chiết khấu{discountKind === "percent" ? ` ${parseMoney(discountValue)}%` : ""}{quotes.length > 1 ? " · tổng booking" : ""}</span>
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
            {quotes.length > 1 && bookingSubtotal !== bookingTotal ? (
              <li className="text-[11px] text-[#8a7a72]">Tạm tính {formatVnd(bookingSubtotal)}</li>
            ) : null}
          </ul>
        ) : (
          <p className="text-[#5c6665]">{selectedRooms.length ? "Ngày trả phải sau ngày nhận" : "Chọn phòng để xem tạm tính"}</p>
        )}
      </div>
      <Field label={fromEz ? "Mã PMS ezCloud" : "Mã PMS (nếu có)"}>
        <input
          name="pmsCode"
          defaultValue={defaults.pmsCode || ""}
          required={fromEz}
          placeholder={fromEz ? "EZ-..." : "Để trống — Ops tự cấp"}
        />
      </Field>
      <Field label="Ghi chú">
        <textarea name="notes" rows={2} defaultValue={defaults.notes || ""} placeholder="Giờ đến, yêu cầu giường..." />
      </Field>
      {showCheckinNow ? (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="checkinNow" value="1" defaultChecked={Boolean(today && defaults.checkIn <= today)} />
          <span>Nhận phòng luôn</span>
        </label>
      ) : null}
      <Btn type="submit" className="w-full" disabled={!roomIds.length}>
        {saveLabel}
      </Btn>
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
  lines: { saleId: string; roomId: string; number: string; type: string; rate: number; checkIn: string; checkOut: string }[];
  rooms: { id: string; number: string; type: string; opsStatus?: string }[];
  types: { name: string; sortOrder: number; baseRate: number; weekendRate: number }[];
  busy?: { roomId: string; checkIn: string; checkOut: string }[];
  extras?: { name: string; qty: number; unitPrice: number; unit: string }[];
  defaults: {
    bookingId: string;
    discountKind?: string;
    discountValue?: number;
    deposit?: number;
    checkIn: string;
    checkOut: string;
    canEditCheckIn?: boolean;
    canEditCheckOut?: boolean;
  };
}) {
  const [picks, setPicks] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.saleId, line.roomId])),
  );
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    defaults.discountKind === "percent" || defaults.discountKind === "amount" ? defaults.discountKind : "none",
  );
  const [discountValue, setDiscountValue] = useState(defaults.discountValue ? String(defaults.discountValue) : "");
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");
  const canEditCheckIn = Boolean(defaults.canEditCheckIn);
  const canEditCheckOut = Boolean(defaults.canEditCheckOut);

  function optionsFor(line: (typeof lines)[number]) {
    return rooms
      .filter((room) => {
        if (room.id !== line.roomId && room.opsStatus === "ooo") return false;
        if (
          room.id !== line.roomId &&
          busy.some((row) => row.roomId === room.id && rangesOverlap(checkIn, checkOut, row.checkIn, row.checkOut))
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
    const kind = roomMoveKind(line.type, room?.type || line.type, types);
    const rate =
      kind === "upgrade" ? catalogRate(types.find((type) => type.name === room?.type), checkIn) || line.rate : line.rate;
    return {
      line,
      room,
      kind,
      rate,
      checkIn,
      checkOut,
    };
  });
  const booked = bookingQuote(
    quoteInputs.map((row) => ({
      rate: row.rate,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nhận phòng">
          {canEditCheckIn ? (
            <input
              name="checkIn"
              type="date"
              required
              value={checkIn}
              onChange={(e) => {
                const next = e.target.value;
                setCheckIn(next);
                if (checkOut <= next) setCheckOut(defaultCheckout(next));
              }}
            />
          ) : (
            <>
              <input type="hidden" name="checkIn" value={checkIn} />
              <input type="date" value={checkIn} disabled />
            </>
          )}
        </Field>
        <Field label="Trả phòng">
          {canEditCheckOut ? (
            <input name="checkOut" type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          ) : (
            <>
              <input type="hidden" name="checkOut" value={checkOut} />
              <input type="date" value={checkOut} disabled />
            </>
          )}
        </Field>
      </div>
      {canEditCheckIn ? (
        <p className="text-xs text-[#5c6665]">Khách chưa nhận — đổi ngày nhận / trả. Tính lại số đêm và tiền phòng.</p>
      ) : canEditCheckOut ? (
        <p className="text-xs text-[#5c6665]">Khách đang ở — chỉ đổi ngày trả. Đêm thêm tính theo giá phòng hiện tại.</p>
      ) : null}
      {lines.map((line) => {
        const options = optionsFor(line);
        const same = options.filter((room) => roomMoveKind(line.type, room.type, types) === "same");
        const upgrades = options.filter((room) => roomMoveKind(line.type, room.type, types) === "upgrade");
        const taken = new Set(Object.entries(picks).filter(([saleId]) => saleId !== line.saleId).map(([, roomId]) => roomId));
        return (
          <Field key={line.saleId} label={`P.${line.number} · ${line.type}`}>
            <input type="hidden" name="saleId" value={line.saleId} />
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
      <p className="text-xs text-[#5c6665]">Đây là tổng đã thu, không phải số tiền lần này. Thu thêm / thu đủ dùng ô Thanh toán phía trên.</p>
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        <ul className="space-y-1">
          {quotes.map((row) => (
            <li key={row.line.saleId} className="flex justify-between gap-2">
              <span>
                P.{row.room?.number || row.line.number}
                {row.kind === "upgrade" ? ` · nâng ${row.room?.type}` : ""} · {row.quote.nights} đêm
              </span>
              <span>{formatVnd(row.quote.subtotal)}</span>
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
  const floors = [...new Set(filtered.map((room) => room.floor ?? 0))].sort((a, b) => a - b);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={saleId} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm số phòng / hạng" />
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-line p-2">
        {floors.map((floor) => (
          <div key={floor}>
            <p className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">Tầng {floor}</p>
            {filtered
              .filter((room) => (room.floor ?? 0) === floor)
              .map((room) => (
                <label key={room.id} className="min-h-11 gap-2 rounded-lg px-2 py-1">
                  <input
                    type="checkbox"
                    name="roomId"
                    value={room.id}
                    checked={roomIds.includes(room.id)}
                    onChange={() => setRoomIds((prev) => (prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id]))}
                  />
                  <span className="text-sm font-semibold">
                    P.{room.number} · {room.type}
                  </span>
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
