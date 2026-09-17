"use client";

import { useState } from "react";
import { recordBookingPaymentAction } from "@/actions/sales";
import { Btn } from "@/components/ui";
import { formatVnd, parseMoney } from "@/lib/sales";

export function BookingPaymentPanel({
  bookingId,
  deposit,
  due,
}: {
  bookingId: string;
  deposit: number;
  due: number;
}) {
  const [amount, setAmount] = useState("");
  const extra = parseMoney(amount);

  if (due <= 0) {
    return <p className="text-sm font-semibold text-[#1b7a4e]">Đã thu đủ {formatVnd(deposit)}</p>;
  }

  return (
    <form action={recordBookingPaymentAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Thu thêm — trống = thu đủ</span>
        <input
          name="amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={String(due)}
        />
      </label>
      {extra && extra < due ? <p className="text-xs text-[#5c6665]">Sau lần này còn {formatVnd(due - extra)}</p> : null}
      <Btn type="submit" className="w-full">
        {extra ? `Thu ${formatVnd(extra)}` : `Thu đủ ${formatVnd(due)}`}
      </Btn>
    </form>
  );
}
