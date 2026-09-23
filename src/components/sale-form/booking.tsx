"use client";

import { useEffect, useState } from "react";
import { Btn, Field, PayMethodField } from "@/components/ui";
import { SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import { bookingDue, bookingQuote, catalogRate, isOtaDebt, isOtaSource, parseMoney, parseDiscountValue, primaryPaymentMethod, rangesOverlap, roomMoveKind } from "@/lib/sales";
import { extraAmount } from "@/lib/extras";
import type { PaymentMethod } from "@/lib/types";
import { BookingRoomLines } from "./booking-lines";
import { BookingQuote } from "./booking-quote";
import { parseDiscountState, type DiscountState, type StayDates } from "./shared";

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
    discountKind?: string;
    discountValue?: number;
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
    otaPaymentMode?: string;
    invoiceRequested?: boolean;
    adults?: number;
    children?: number;
    breakfastAdults?: number;
    breakfastChildren?: number;
    cars?: number;
    bikes?: number;
    deposit?: number;
    cashPaid?: number;
    transferPaid?: number;
    companyPaid?: number;
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
  const [adults, setAdults] = useState(String(defaults.adults ?? 1));
  const [children, setChildren] = useState(String(defaults.children ?? 0));
  const [breakfastAdults, setBreakfastAdults] = useState(
    String(defaults.breakfastAdults ?? defaults.adults ?? 1),
  );
  const [breakfastChildren, setBreakfastChildren] = useState(
    String(defaults.breakfastChildren ?? defaults.children ?? 0),
  );
  const [breakfastPaxTouched, setBreakfastPaxTouched] = useState(false);
  const [discounts, setDiscounts] = useState<Record<string, DiscountState>>(() =>
    Object.fromEntries(lines.map((line) => [line.saleId, parseDiscountState(line.discountKind, line.discountValue)])),
  );
  const [source, setSource] = useState(defaults.source || "walk_in");
  const [otaPaymentMode, setOtaPaymentMode] = useState<"debt" | "hotel">(
    defaults.otaPaymentMode === "hotel" ? "hotel" : "debt",
  );
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");
  const [payMethod, setPayMethod] = useState<PaymentMethod>(() => primaryPaymentMethod(defaults));
  const ota = isOtaSource(source);
  const otaDebt = isOtaDebt(source, otaPaymentMode);
  const switchedToOtaDebt = otaDebt && !isOtaDebt(defaults.source, defaults.otaPaymentMode);

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
      discountKind: discounts[line.saleId]?.kind || "none",
      discountValue: parseDiscountValue(discounts[line.saleId]?.kind, discounts[line.saleId]?.value),
    };
  });
  const booked = bookingQuote(
    quoteInputs.map((row) => ({
      rate: row.rate,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      breakfast: row.breakfast,
      discountKind: row.discountKind,
      discountValue: row.discountValue,
    })),
  );
  const quotes = quoteInputs.map((row, index) => ({
    ...row,
    quote: booked.lines[index],
  }));
  const extraRows = extras.map((row) => ({ ...row, amount: extraAmount(row, booked.nights) }));
  const extrasTotal = extraRows.reduce((sum, row) => sum + row.amount, 0);
  const bookingTotal = booked.total + extrasTotal;
  const depositAmount = switchedToOtaDebt ? 0 : parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);
  const stayAdults = Math.max(1, Number(adults) || 1);
  const stayChildren = Math.max(0, Number(children) || 0);
  const anyBreakfast = lines.some((line) => breakfast[line.saleId] !== false);
  useEffect(() => {
    if (!anyBreakfast) {
      setBreakfastAdults("0");
      setBreakfastChildren("0");
      return;
    }
    if (!breakfastPaxTouched) {
      setBreakfastAdults((prev) => {
        const current = Number(prev);
        if (!Number.isFinite(current)) return String(stayAdults);
        return String(Math.min(stayAdults, Math.max(0, current)));
      });
      setBreakfastChildren((prev) => {
        const current = Number(prev);
        if (!Number.isFinite(current)) return String(stayChildren);
        return String(Math.min(stayChildren, Math.max(0, current)));
      });
      return;
    }
    setBreakfastAdults((prev) => String(Math.min(stayAdults, Math.max(0, Number(prev) || 0))));
    setBreakfastChildren((prev) => String(Math.min(stayChildren, Math.max(0, Number(prev) || 0))));
  }, [anyBreakfast, stayAdults, stayChildren, breakfastPaxTouched]);

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
        <select name="source" value={source} onChange={(e) => setSource(e.target.value)}>
          {SALE_SOURCE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.values.map((value) => (
                <option key={value} value={value}>
                  {SALE_SOURCE_LABEL[value]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {ota ? (
        <Field label="Hình thức thanh toán OTA">
          <select name="otaPaymentMode" value={otaPaymentMode} onChange={(e) => setOtaPaymentMode(e.target.value as "debt" | "hotel")}>
            <option value="debt">Công nợ OTA — OTA đã thu khách</option>
            <option value="hotel">Thanh toán tại KS — khách trả khi check-in</option>
          </select>
        </Field>
      ) : (
        <input type="hidden" name="otaPaymentMode" value="debt" />
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="invoiceRequested" value="1" defaultChecked={defaults.invoiceRequested} />
        <span>Xuất hóa đơn</span>
      </label>
      <p className="text-xs font-semibold text-[#5c6665]">Khách ở</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Người lớn">
          <input
            name="adults"
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
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
      <BookingRoomLines
        lines={lines}
        types={types}
        picks={picks}
        setPicks={setPicks}
        dates={dates}
        setDates={setDates}
        breakfast={breakfast}
        setBreakfast={setBreakfast}
        discounts={discounts}
        setDiscounts={setDiscounts}
        optionsFor={optionsFor}
        stayOf={stayOf}
      />
      {ota ? (
        <input type="hidden" name="deposit" value={otaDebt ? "0" : String(defaults.deposit || 0)} />
      ) : (
        <>
          <Field label="Đặt cọc — tổng đã thu (₫)">
            <input name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
          </Field>
          <PayMethodField value={payMethod} onChange={setPayMethod} />
        </>
      )}
      <Field label="Ghi chú">
        <textarea name="notes" rows={2} defaultValue={defaults.notes || ""} placeholder="Giờ đến, giường, xe đón..." />
      </Field>
      <p className="text-xs text-[#5c6665]">Sửa tên, SĐT, số khách, kênh. Đổi số phòng cùng hạng hoặc nâng hạng. Ngày, ăn sáng và chiết khấu theo từng phòng.</p>
      <BookingQuote
        quotes={quotes}
        extraRows={extraRows}
        booked={booked}
        bookingTotal={bookingTotal}
        depositAmount={depositAmount}
        defaults={defaults}
        payMethod={payMethod}
        ota={ota}
        otaDebt={otaDebt}
        due={due}
      />
      <Btn type="submit" className="w-full">
        Lưu booking
      </Btn>
    </form>
  );
}

