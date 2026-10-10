"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Field } from "@/components/ui";
import { SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
import { extraAmount } from "@/lib/extras";
import {
  bookingDue,
  bookingQuote,
  catalogRate,
  defaultCheckout,
  isOtaSource,
  nightsBetween,
  formatVnd,
  parseMoney,
  parseDiscountValue,
  ratesFromBookingTotal,
} from "@/lib/sales";
import { defaultAdultsForRoomType } from "@/lib/rooms-catalog";
import type { PaymentMethod } from "@/lib/types";
import { OtaCommissionFields, type CommissionKind } from "./commission";
import { SaleFormExtras, type DraftExtra, type ExtraTypeOption } from "./extras";
import { SaleFormRooms } from "./new-rooms";
import { SaleFormSide } from "./new-side";
import { BookingSaveDialog } from "./save-confirm";
import { RoomTypeAvailability } from "./room-type-availability";
import { emptyDiscount, groupRoomsByType, roomOpen, type DiscountState, type Room, type RoomType, type StayDates } from "./shared";

export function SaleForm({
  action,
  rooms,
  types,
  extraTypes = [],
  busy = [],
  defaults,
  submitLabel,
  showCheckinNow,
  today,
  allowMultiple,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rooms: Room[];
  types: RoomType[];
  extraTypes?: ExtraTypeOption[];
  busy?: { roomId: string; checkIn: string; checkOut: string }[];
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
    breakfastAdults?: number;
    breakfastChildren?: number;
    cars?: number;
    bikes?: number;
    rate?: number;
    discountKind?: string;
    discountValue?: number;
    deposit?: number;
    pmsCode?: string;
    notes?: string;
    date?: string;
    invoiceRequested?: boolean;
  };
  submitLabel: string;
  showCheckinNow?: boolean;
  today?: string;
  allowMultiple?: boolean;
}) {
  const typeByName = useMemo(() => Object.fromEntries(types.map((type) => [type.name, type])), [types]);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sharedStay, setSharedStay] = useState<StayDates>({ checkIn: defaults.checkIn, checkOut: defaults.checkOut });
  const [dates, setDates] = useState<Record<string, StayDates>>({});
  const [breakfast, setBreakfast] = useState<Record<string, boolean>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, DiscountState>>({});
  const [source, setSource] = useState(defaults.source || "walk_in");
  const [otaPaymentMode, setOtaPaymentMode] = useState<"debt" | "hotel">("debt");
  const [commissionKind, setCommissionKind] = useState<CommissionKind>("percent");
  const [commission, setCommission] = useState("");
  const [otaTotal, setOtaTotal] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const skipConfirm = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [previewGuest, setPreviewGuest] = useState({ name: "", phone: "" });
  const [extras, setExtras] = useState<DraftExtra[]>([]);
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("personal");
  const [invoiceOn, setInvoiceOn] = useState(Boolean(defaults.invoiceRequested));
  const ota = isOtaSource(source);
  const otaDebt = ota && otaPaymentMode === "debt";
  const commissionValue = commissionKind === "percent"
    ? Math.min(100, Math.max(0, Math.round(Number(commission) || 0)))
    : parseMoney(commission);
  const selectedRooms = rooms.filter((room) => roomIds.includes(room.id));
  const [roomAdults, setRoomAdults] = useState<Record<string, string>>({});
  const [roomChildren, setRoomChildren] = useState<Record<string, string>>({});
  const [breakfastAdults, setBreakfastAdults] = useState(String(defaults.breakfastAdults ?? defaults.adults ?? ""));
  const [breakfastChildren, setBreakfastChildren] = useState(String(defaults.breakfastChildren ?? defaults.children ?? 0));
  const [breakfastPaxTouched, setBreakfastPaxTouched] = useState(false);
  const otaNightCounts = selectedRooms.map((room) => {
    const stay = dates[room.id] || sharedStay;
    return Math.max(0, nightsBetween(stay.checkIn, stay.checkOut));
  });
  const otaRateList = ota ? ratesFromBookingTotal(parseMoney(otaTotal), otaNightCounts) : [];
  const otaRates = Object.fromEntries(selectedRooms.map((room, index) => [room.id, otaRateList[index] || 0]));
  const quoteInputs = selectedRooms.map((room) => {
    const stay = dates[room.id] || sharedStay;
    return {
      room,
      rate: ota ? otaRates[room.id] || 0 : parseMoney(rates[room.id]),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      breakfast: breakfast[room.id] !== false,
      discountKind: ota ? "none" : discounts[room.id]?.kind || "none",
      discountValue: ota ? 0 : parseDiscountValue(discounts[room.id]?.kind, discounts[room.id]?.value),
    };
  });
  const booked = bookingQuote(quoteInputs);
  const quotes = quoteInputs.map((row, index) => ({ ...row, quote: booked.lines[index] }));
  const extraNights = selectedRooms.length ? booked.nights : Math.max(0, nightsBetween(sharedStay.checkIn, sharedStay.checkOut));
  const extraRows = extras.map((row) => ({ ...row, amount: extraAmount(row, extraNights) }));
  const bookingTotal = booked.total + extraRows.reduce((sum, row) => sum + row.amount, 0);
  const commissionAmount = ota
    ? commissionKind === "amount"
      ? Math.min(bookingTotal, commissionValue)
      : Math.round(bookingTotal * commissionValue / 100)
    : 0;
  const commissionLabel = commissionKind === "amount" ? "Hoa hồng" : `Hoa hồng ${commissionValue}%`;
  const depositAmount = ota ? 0 : parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);
  function capOf(room: { type: string }) {
    return defaultAdultsForRoomType(room.type, typeByName[room.type]?.adults);
  }
  function adultsOf(room: (typeof selectedRooms)[number]) {
    const cap = capOf(room);
    const raw = roomAdults[room.id];
    if (raw == null) return cap;
    return Math.min(cap, Math.max(1, Math.round(Number(raw) || 1)));
  }
  function childrenOf(room: (typeof selectedRooms)[number]) {
    return Math.max(0, Math.round(Number(roomChildren[room.id]) || 0));
  }
  const stayAdults = selectedRooms.reduce((sum, room) => sum + adultsOf(room), 0);
  const stayChildren = selectedRooms.reduce((sum, room) => sum + childrenOf(room), 0);
  const anyBreakfast = selectedRooms.some((room) => breakfast[room.id] !== false);
  const openRooms = useMemo(
    () => rooms.filter((room) => room.opsStatus !== "ooo" && roomOpen(room.id, sharedStay.checkIn, sharedStay.checkOut, busy)),
    [rooms, sharedStay, busy],
  );
  useEffect(() => {
    if (!anyBreakfast) {
      setBreakfastAdults("0");
      setBreakfastChildren("0");
      return;
    }
    if (!breakfastPaxTouched) {
      setBreakfastAdults(String(stayAdults));
      setBreakfastChildren(String(stayChildren));
      return;
    }
    setBreakfastAdults((prev) => String(Math.min(stayAdults, Math.max(0, Number(prev) || 0))));
    setBreakfastChildren((prev) => String(Math.min(stayChildren, Math.max(0, Number(prev) || 0))));
  }, [anyBreakfast, stayAdults, stayChildren, breakfastPaxTouched]);
  useEffect(() => {
    setRoomIds((prev) => prev.filter((id) => roomOpen(id, sharedStay.checkIn, sharedStay.checkOut, busy)));
    setDates((prev) => {
      const ids = Object.keys(prev);
      if (!ids.length) return prev;
      const next = { ...prev };
      for (const id of ids) next[id] = sharedStay;
      return next;
    });
    setRates((prev) => {
      const ids = Object.keys(prev);
      if (!ids.length) return prev;
      const next = { ...prev };
      for (const id of ids) {
        const room = rooms.find((item) => item.id === id);
        const value = catalogRate(typeByName[room?.type || ""], sharedStay.checkIn);
        if (value) next[id] = String(value);
      }
      return next;
    });
  }, [sharedStay, busy, rooms, typeByName]);
  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return openRooms;
    return openRooms.filter((room) => `p.${room.number} ${room.number} ${room.type}`.toLowerCase().includes(q));
  }, [openRooms, query]);
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
      const current = prev[roomId] || sharedStay;
      const next = { ...current, ...patch };
      if (next.checkOut <= next.checkIn) next.checkOut = defaultCheckout(next.checkIn);
      return { ...prev, [roomId]: next };
    });
  }

  function updateSharedStay(patch: Partial<StayDates>) {
    setSharedStay((current) => {
      const next = { ...current, ...patch };
      if (next.checkOut <= next.checkIn) next.checkOut = defaultCheckout(next.checkIn);
      return next;
    });
  }

  function toggleRoom(id: string) {
    setRoomIds((prev) => {
      const on = prev.includes(id);
      const next = on ? prev.filter((item) => item !== id) : [...prev, id];
      if (!on) {
        setStay(id, sharedStay);
        setBreakfast((prevBreakfast) => ({ ...prevBreakfast, [id]: true }));
        setDiscounts((prev) => ({ ...prev, [id]: prev[id] || emptyDiscount() }));
        const value = catalogFor(id, sharedStay.checkIn);
        if (value) setRoomRate(id, String(value));
      }
      return next;
    });
  }

  const saveLabel = allowMultiple && roomIds.length > 1 ? `Lưu ${roomIds.length} phòng` : submitLabel;
  const typedOtaTotal = parseMoney(otaTotal);
  const otaShort = ota && typedOtaTotal > booked.total ? typedOtaTotal - booked.total : 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (skipConfirm.current) {
      skipConfirm.current = false;
      return;
    }
    event.preventDefault();
    if (!roomIds.length) return;
    const data = new FormData(event.currentTarget);
    setPreviewGuest({ name: String(data.get("guestName") || ""), phone: String(data.get("guestPhone") || "") });
    setConfirming(true);
  }

  function confirmSave() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    skipConfirm.current = true;
    setConfirming(false);
    form.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} className="sale-form-desk space-y-3" onSubmit={onSubmit}>
      <div className="sale-form-main card p-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults.date ? <input type="hidden" name="date" value={defaults.date} /> : null}
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
        <>
          <Field label="Hình thức thanh toán OTA">
            <select name="otaPaymentMode" value={otaPaymentMode} onChange={(e) => setOtaPaymentMode(e.target.value as "debt" | "hotel")}>
              <option value="debt">Công nợ OTA — OTA đã thu khách</option>
              <option value="hotel">Thanh toán tại KS — khách trả khách sạn</option>
            </select>
          </Field>
          <Field label="Tổng booking (₫)">
            <input
              name="otaTotal"
              inputMode="numeric"
              required
              value={otaTotal}
              onChange={(e) => setOtaTotal(e.target.value)}
              placeholder="0"
            />
          </Field>
          <p className="-mt-1 text-xs text-[#5c6665]">Tiền phòng của cả booking. Chọn hạng và số phòng, không nhập giá từng phòng.</p>
          {otaShort ? (
            <p className="-mt-1 text-xs text-[#9a5b00]">
              Còn {formatVnd(otaShort)} không chia hết theo số đêm. Tổng lưu {formatVnd(booked.total)}.
            </p>
          ) : null}
          <OtaCommissionFields kind={commissionKind} value={commission} onKind={setCommissionKind} onValue={setCommission} />
          <p className="-mt-1 text-xs text-[#5c6665]">Hoa hồng phải trả đối tác: {formatVnd(commissionAmount)}</p>
        </>
      ) : (
        <>
          <input type="hidden" name="otaPaymentMode" value="debt" />
          <input type="hidden" name="otaCommissionKind" value="percent" />
          <input type="hidden" name="otaCommissionValue" value="0" />
        </>
      )}
      <label className="flex items-center gap-2">
        {ota ? <input type="hidden" name="invoiceRequested" value="1" /> : null}
        <input
          type="checkbox"
          name={ota ? undefined : "invoiceRequested"}
          value="1"
          checked={ota || invoiceOn}
          disabled={ota}
          onChange={(e) => setInvoiceOn(e.target.checked)}
        />
        <span>Xuất hóa đơn</span>
      </label>
      {ota ? <p className="-mt-2 text-xs text-[#5c6665]">OTA luôn xuất hóa đơn.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nhận">
          <input
            name="checkIn"
            type="date"
            required
            value={sharedStay.checkIn}
            onChange={(e) => updateSharedStay({ checkIn: e.target.value })}
          />
        </Field>
        <Field label="Trả">
          <input
            name="checkOut"
            type="date"
            required
            value={sharedStay.checkOut}
            onChange={(e) => updateSharedStay({ checkOut: e.target.value })}
          />
        </Field>
      </div>
      <RoomTypeAvailability
        rooms={rooms}
        types={types}
        busy={busy}
        checkIn={sharedStay.checkIn}
        checkOut={sharedStay.checkOut}
      />
      <SaleFormRooms
        allowMultiple={allowMultiple}
        openRooms={openRooms}
        query={query}
        setQuery={setQuery}
        typeGroups={typeGroups}
        roomIds={roomIds}
        toggleRoom={toggleRoom}
        selectedRooms={selectedRooms}
        filteredRooms={filteredRooms}
        setRoomIds={setRoomIds}
        sharedStay={sharedStay}
        setStay={setStay}
        catalogFor={catalogFor}
        setRoomRate={setRoomRate}
        dates={dates}
        breakfast={breakfast}
        setBreakfast={setBreakfast}
        rates={rates}
        ota={ota}
        otaRates={otaRates}
        discounts={discounts}
        setDiscounts={setDiscounts}
        typeByName={typeByName}
        capOf={capOf}
        adultsOf={adultsOf}
        childrenOf={childrenOf}
        setRoomAdults={setRoomAdults}
        setRoomChildren={setRoomChildren}
      />
      <SaleFormExtras types={extraTypes} nights={extraNights} extras={extras} setExtras={setExtras} />
      </div>
      <SaleFormSide
        deposit={deposit}
        setDeposit={setDeposit}
        depositAmount={depositAmount}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        selectedRooms={selectedRooms}
        quotes={quotes}
        extraRows={extraRows}
        extraNights={extraNights}
        bookingTotal={bookingTotal}
        due={due}
        defaults={defaults}
        stayAdults={stayAdults}
        stayChildren={stayChildren}
        breakfastAdults={breakfastAdults}
        breakfastChildren={breakfastChildren}
        anyBreakfast={anyBreakfast}
        setBreakfastPaxTouched={setBreakfastPaxTouched}
        setBreakfastAdults={setBreakfastAdults}
        setBreakfastChildren={setBreakfastChildren}
        ota={ota}
        otaDebt={otaDebt}
        commissionLabel={commissionLabel}
        commissionAmount={commissionAmount}
        showCheckinNow={showCheckinNow}
        today={today}
        roomIds={roomIds}
        saveLabel={saveLabel}
      />
      {confirming ? (
        <BookingSaveDialog
          guestName={previewGuest.name}
          guestPhone={previewGuest.phone}
          source={source}
          lines={quotes.map((row) => ({
            id: row.room.id,
            title: `${row.room.type} · P.${row.room.number}`,
            detail: `${formatDateNumeric(row.checkIn)} → ${formatDateNumeric(row.checkOut)} · ${row.quote.nights} đêm`,
          }))}
          money={
            ota
              ? [
                  { label: "Tổng tiền phòng", value: formatVnd(booked.total) },
                  ...(extraRows.length ? [{ label: "Phụ thu", value: formatVnd(extraRows.reduce((sum, row) => sum + row.amount, 0)) }] : []),
                  { label: commissionLabel, value: formatVnd(commissionAmount) },
                  { label: otaDebt ? "Công nợ OTA" : "Phải thu khi check-in", value: formatVnd(bookingTotal), emphasis: true },
                ]
              : [
                  { label: quotes.length > 1 ? `Phải thu ${quotes.length} phòng` : "Phải thu", value: formatVnd(bookingTotal) },
                  { label: depositAmount ? "Đặt cọc" : "Đặt cọc", value: depositAmount ? `−${formatVnd(depositAmount)}` : "Chưa có" },
                  { label: "Còn phải thu", value: formatVnd(due), emphasis: true },
                ]
          }
          note={otaShort ? `Còn ${formatVnd(otaShort)} không chia hết theo số đêm.` : undefined}
          confirmLabel={saveLabel}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmSave}
        />
      ) : null}
    </form>
  );
}

