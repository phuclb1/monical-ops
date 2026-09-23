"use client";

import { Btn, Field, PayMethodField } from "@/components/ui";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatVnd } from "@/lib/sales";
import type { PaymentMethod } from "@/lib/types";
import type { Room } from "./shared";

export function SaleFormSide(props: {
  deposit: string;
  setDeposit: (value: string) => void;
  depositAmount: number;
  payMethod: PaymentMethod;
  setPayMethod: (value: PaymentMethod) => void;
  selectedRooms: Room[];
  quotes: { room: Room; rate: number; quote: { nights: number; gross?: number; subtotal: number; breakfastOff: number; discount: number }; discountKind: string; discountValue: number }[];
  extraRows?: { key: string; name: string; qty: number; unit: string; unitPrice: number; amount: number }[];
  extraNights?: number;
  bookingTotal: number;
  due: number;
  defaults: { guestName?: string; guestPhone?: string; cars?: number; bikes?: number; pmsCode?: string; notes?: string; checkIn: string };
  adults: string;
  setAdultsTouched: (value: boolean) => void;
  setAdults: (value: string) => void;
  children: string;
  setChildren: (value: string) => void;
  stayAdults: number;
  stayChildren: number;
  breakfastAdults: string;
  breakfastChildren: string;
  anyBreakfast: boolean;
  setBreakfastPaxTouched: (value: boolean) => void;
  setBreakfastAdults: (value: string) => void;
  setBreakfastChildren: (value: string) => void;
  ota?: boolean;
  fromEz: boolean;
  showCheckinNow?: boolean;
  today?: string;
  roomIds: string[];
  saveLabel: string;
}) {
  const {
    deposit,
    setDeposit,
    depositAmount,
    payMethod,
    setPayMethod,
    selectedRooms,
    quotes,
    extraRows = [],
    extraNights = 0,
    bookingTotal,
    due,
    defaults,
    adults,
    setAdultsTouched,
    setAdults,
    children,
    setChildren,
    stayAdults,
    stayChildren,
    breakfastAdults,
    breakfastChildren,
    anyBreakfast,
    setBreakfastPaxTouched,
    setBreakfastAdults,
    setBreakfastChildren,
    ota,
    fromEz,
    showCheckinNow,
    today,
    roomIds,
    saveLabel,
  } = props;
  return (
      <div className="sale-form-side card p-4">
      {ota ? (
        <input type="hidden" name="deposit" value="0" />
      ) : (
        <>
          <Field label="Đặt cọc (₫)">
            <input name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
          </Field>
          {depositAmount ? <PayMethodField value={payMethod} onChange={setPayMethod} /> : <input type="hidden" name="paymentMethod" value={payMethod} />}
        </>
      )}
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        {selectedRooms.length && quotes.every((row) => row.quote.nights > 0) ? (
          <ul className="space-y-1">
            {quotes.map((row) => (
              <li key={row.room.id}>
                <div className="flex justify-between gap-2">
                  <span>
                    {row.room.type} · {row.quote.nights} đêm × {formatVnd(row.rate)}
                  </span>
                  <span>{formatVnd(row.quote.gross ?? row.quote.subtotal + row.quote.breakfastOff)}</span>
                </div>
                {row.quote.breakfastOff ? (
                  <div className="flex justify-between gap-2 text-xs text-[#c47b12]">
                    <span>Không ăn sáng</span>
                    <span>−{formatVnd(row.quote.breakfastOff)}</span>
                  </div>
                ) : null}
                {row.quote.discount || row.discountKind !== "none" ? (
                  <div className="flex justify-between gap-2 text-xs text-[#1b7a4e]">
                    <span>Chiết khấu{row.discountKind === "percent" ? ` ${row.discountValue}%` : ""}</span>
                    <span>−{formatVnd(row.quote.discount)}</span>
                  </div>
                ) : null}
              </li>
            ))}
            {extraRows.map((row) => (
              <li key={row.key} className="flex justify-between gap-2">
                <span>
                  {row.name}
                  {row.unit === "night" ? ` · ${row.qty} × ${extraNights} đêm` : row.unit === "kg" ? ` · ${row.qty} kg` : ""}
                </span>
                <span>{formatVnd(row.amount)}</span>
              </li>
            ))}
            <li className={`flex justify-between gap-2${ota ? " font-bold" : ""}`}>
              <span>{ota ? "Công nợ OTA" : quotes.length > 1 ? `Phải thu ${quotes.length} phòng` : "Phải thu"}</span>
              <span>{formatVnd(bookingTotal)}</span>
            </li>
            {ota ? null : (
              <>
                {depositAmount ? (
                  <li className="flex justify-between gap-2 text-[#1b7a4e]">
                    <span>Đã đặt cọc · {PAYMENT_METHOD_LABEL[payMethod]}</span>
                    <span>−{formatVnd(depositAmount)}</span>
                  </li>
                ) : (
                  <li className="text-[#c47b12]">Chưa đặt cọc</li>
                )}
                <li className="flex justify-between gap-2 font-bold">
                  <span>Còn phải thu</span>
                  <span>{formatVnd(due)}</span>
                </li>
              </>
            )}
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
      <p className="text-xs font-semibold text-[#5c6665]">Khách ở</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input
            name="adults"
            type="number"
            min={1}
            value={adults}
            onChange={(e) => {
              setAdultsTouched(true);
              setAdults(e.target.value);
            }}
          />
        </Field>
        <Field label="Trẻ em">
          <input
            name="children"
            type="number"
            min={0}
            value={children}
            onChange={(e) => setChildren(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs font-semibold text-[#5c6665]">Khách ăn sáng · không lớn hơn khách ở</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input
            name="breakfastAdults"
            type="number"
            min={0}
            max={stayAdults}
            value={breakfastAdults}
            disabled={!anyBreakfast}
            onChange={(e) => {
              setBreakfastPaxTouched(true);
              setBreakfastAdults(e.target.value);
            }}
          />
        </Field>
        <Field label="Trẻ em">
          <input
            name="breakfastChildren"
            type="number"
            min={0}
            max={stayChildren}
            value={breakfastChildren}
            disabled={!anyBreakfast}
            onChange={(e) => {
              setBreakfastPaxTouched(true);
              setBreakfastChildren(e.target.value);
            }}
          />
        </Field>
      </div>
      {!anyBreakfast ? (
        <>
          <input type="hidden" name="breakfastAdults" value="0" />
          <input type="hidden" name="breakfastChildren" value="0" />
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ô tô">
          <input name="cars" type="number" min={0} defaultValue={defaults.cars ?? 0} />
        </Field>
        <Field label="Xe máy">
          <input name="bikes" type="number" min={0} defaultValue={defaults.bikes ?? 0} />
        </Field>
      </div>
      <Field label={fromEz ? "Mã PMS ezCloud" : "Mã PMS (nếu có)"}>
        <input
          name="pmsCode"
          defaultValue={defaults.pmsCode || ""}
          required={fromEz}
          placeholder={fromEz ? "EZ-..." : "Để trống — Ops cấp BK-09-1"}
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
  );
}
