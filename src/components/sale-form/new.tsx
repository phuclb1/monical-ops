"use client";

import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui";
import { SALE_SOURCE_GROUPS, SALE_SOURCE_LABEL } from "@/lib/constants";
import {
  bookingDue,
  bookingQuote,
  catalogRate,
  defaultCheckout,
  isOtaSource,
  parseMoney,
  parseDiscountValue,
} from "@/lib/sales";
import { defaultAdultsForRooms } from "@/lib/rooms-catalog";
import type { PaymentMethod } from "@/lib/types";
import { SaleFormRooms } from "./new-rooms";
import { SaleFormSide } from "./new-side";
import { emptyDiscount, groupRoomsByType, roomOpen, type DiscountState, type Room, type RoomType, type StayDates } from "./shared";

export function SaleForm({
  action,
  rooms,
  types,
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
  const [deposit, setDeposit] = useState(defaults.deposit ? String(defaults.deposit) : "");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("personal");
  const ota = isOtaSource(source);
  const [fromEz, setFromEz] = useState(defaults.origin === "ezcloud");
  const selectedRooms = rooms.filter((room) => roomIds.includes(room.id));
  const occupancyAdults = useMemo(() => defaultAdultsForRooms(selectedRooms, types), [selectedRooms, types]);
  const [adults, setAdults] = useState(String(defaults.adults ?? occupancyAdults));
  const [children, setChildren] = useState(String(defaults.children ?? 0));
  const [adultsTouched, setAdultsTouched] = useState(false);
  const [breakfastAdults, setBreakfastAdults] = useState(String(defaults.breakfastAdults ?? defaults.adults ?? occupancyAdults));
  const [breakfastChildren, setBreakfastChildren] = useState(String(defaults.breakfastChildren ?? defaults.children ?? 0));
  const [breakfastPaxTouched, setBreakfastPaxTouched] = useState(false);
  const quoteInputs = selectedRooms.map((room) => {
    const stay = dates[room.id] || sharedStay;
    return {
      room,
      rate: parseMoney(rates[room.id]),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      breakfast: breakfast[room.id] !== false,
      discountKind: discounts[room.id]?.kind || "none",
      discountValue: parseDiscountValue(discounts[room.id]?.kind, discounts[room.id]?.value),
    };
  });
  const booked = bookingQuote(quoteInputs);
  const quotes = quoteInputs.map((row, index) => ({ ...row, quote: booked.lines[index] }));
  const bookingTotal = booked.total;
  const depositAmount = ota ? 0 : parseMoney(deposit);
  const due = bookingDue(bookingTotal, depositAmount);
  const stayAdults = Math.max(1, Number(adults) || 1);
  const stayChildren = Math.max(0, Number(children) || 0);
  const anyBreakfast = selectedRooms.some((room) => breakfast[room.id] !== false);
  const openRooms = useMemo(
    () => rooms.filter((room) => room.opsStatus !== "ooo" && roomOpen(room.id, sharedStay.checkIn, sharedStay.checkOut, busy)),
    [rooms, sharedStay, busy],
  );
  useEffect(() => {
    if (!adultsTouched) setAdults(String(occupancyAdults));
  }, [occupancyAdults, adultsTouched]);
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

  return (
    <form action={action} className="sale-form-desk space-y-3">
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
      <label className="flex items-center gap-2">
        <input type="checkbox" name="fromEzcloud" value="1" checked={fromEz} onChange={(e) => setFromEz(e.target.checked)} />
        <span>Từ ezCloud</span>
      </label>
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
        discounts={discounts}
        setDiscounts={setDiscounts}
        typeByName={typeByName}
      />
      </div>
      <SaleFormSide
        deposit={deposit}
        setDeposit={setDeposit}
        depositAmount={depositAmount}
        payMethod={payMethod}
        setPayMethod={setPayMethod}
        selectedRooms={selectedRooms}
        quotes={quotes}
        bookingTotal={bookingTotal}
        due={due}
        defaults={defaults}
        adults={adults}
        setAdultsTouched={setAdultsTouched}
        setAdults={setAdults}
        children={children}
        setChildren={setChildren}
        stayAdults={stayAdults}
        stayChildren={stayChildren}
        breakfastAdults={breakfastAdults}
        breakfastChildren={breakfastChildren}
        anyBreakfast={anyBreakfast}
        setBreakfastPaxTouched={setBreakfastPaxTouched}
        setBreakfastAdults={setBreakfastAdults}
        setBreakfastChildren={setBreakfastChildren}
        ota={ota}
        fromEz={fromEz}
        showCheckinNow={showCheckinNow}
        today={today}
        roomIds={roomIds}
        saveLabel={saveLabel}
      />
    </form>
  );
}

