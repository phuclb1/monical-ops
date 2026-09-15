"use client";

import { useMemo, useState } from "react";
import { Btn, Field } from "@/components/ui";
import { DISCOUNT_KIND_LABEL, SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import { catalogRate, defaultCheckout, formatVnd, isWeekendNight, parseMoney, saleQuote } from "@/lib/sales";
import { DISCOUNT_KINDS, type DiscountKind } from "@/lib/types";

type Room = { id: string; number: string; type: string };
type RoomType = { name: string; baseRate: number; weekendRate: number };

export function SaleForm({
  action,
  rooms,
  types,
  defaults,
  submitLabel,
  showCheckinNow,
  today,
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
}) {
  const typeByName = useMemo(() => Object.fromEntries(types.map((type) => [type.name, type])), [types]);
  const [roomId, setRoomId] = useState(defaults.roomId || rooms[0]?.id || "");
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
  const initialRoom = rooms.find((room) => room.id === (defaults.roomId || rooms[0]?.id));
  const [rate, setRate] = useState(
    String(defaults.rate ?? catalogRate(typeByName[initialRoom?.type || ""], defaults.checkIn) ?? ""),
  );
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    defaults.discountKind === "percent" || defaults.discountKind === "amount" ? defaults.discountKind : "none",
  );
  const [discountValue, setDiscountValue] = useState(defaults.discountValue ? String(defaults.discountValue) : "");
  const [fromEz, setFromEz] = useState(defaults.origin === "ezcloud");
  const selected = rooms.find((room) => room.id === roomId);
  const catalog = catalogRate(typeByName[selected?.type || ""], checkIn);
  const quote = saleQuote({
    rate: parseMoney(rate),
    checkIn,
    checkOut,
    discountKind,
    discountValue: parseMoney(discountValue),
  });

  function applyCatalog(nextRoomId: string, nextCheckIn: string) {
    const room = rooms.find((item) => item.id === nextRoomId);
    const next = catalogRate(typeByName[room?.type || ""], nextCheckIn);
    if (next) setRate(String(next));
  }

  return (
    <form action={action} className="space-y-3">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults.date ? <input type="hidden" name="date" value={defaults.date} /> : null}
      <Field label="Phòng">
        <select
          name="roomId"
          required
          value={roomId}
          onChange={(e) => {
            const next = e.target.value;
            setRoomId(next);
            applyCatalog(next, checkIn);
          }}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              P.{room.number} · {room.type}
            </option>
          ))}
        </select>
      </Field>
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
              applyCatalog(roomId, next);
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
      <Field label="Giá / đêm (₫)">
        <input name="rate" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="800000" />
      </Field>
      {catalog ? (
        <p className="text-xs text-[#5c6665]">
          Giá bảng {isWeekendNight(checkIn) ? "cuối tuần" : "ngày thường"}: {formatVnd(catalog)}
          {selected ? ` · ${selected.type}` : ""}
        </p>
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
        <input name="deposit" inputMode="numeric" defaultValue={defaults.deposit ? String(defaults.deposit) : ""} placeholder="0" />
      </Field>
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        {quote.nights > 0 ? (
          <ul className="space-y-1">
            <li className="flex justify-between gap-2">
              <span>{quote.nights} đêm × {formatVnd(parseMoney(rate))}</span>
              <span>{formatVnd(quote.subtotal)}</span>
            </li>
            {quote.discount ? (
              <li className="flex justify-between gap-2 text-[#1b7a4e]">
                <span>Chiết khấu{discountKind === "percent" ? ` ${parseMoney(discountValue)}%` : ""}</span>
                <span>−{formatVnd(quote.discount)}</span>
              </li>
            ) : null}
            <li className="flex justify-between gap-2 font-bold">
              <span>Phải thu</span>
              <span>{formatVnd(quote.total)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-[#5c6665]">Ngày trả phải sau ngày nhận</p>
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
      <Btn type="submit" className="w-full">
        {submitLabel}
      </Btn>
    </form>
  );
}
