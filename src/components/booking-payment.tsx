"use client";

import { useState } from "react";
import { recordBookingPaymentAction } from "@/actions/sales";
import { Btn, PayMethodField } from "@/components/ui";
import { formatVnd, paidNote, parseMoney } from "@/lib/sales";

export function BookingPaymentPanel({
  bookingId,
  deposit,
  due,
  cashPaid,
  transferPaid,
}: {
  bookingId: string;
  deposit: number;
  due: number;
  cashPaid?: number;
  transferPaid?: number;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const extra = parseMoney(amount);
  const note = paidNote({ cashPaid, transferPaid, deposit });

  if (due <= 0) {
    return (
      <p className="text-sm font-semibold text-[#1b7a4e]">
        Đã thu đủ {formatVnd(deposit)}
        {note ? ` · ${note}` : ""}
      </p>
    );
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
      <PayMethodField value={method} onChange={setMethod} />
      {note ? <p className="text-xs text-[#5c6665]">Đã thu {note}</p> : null}
      {extra && extra < due ? <p className="text-xs text-[#5c6665]">Sau lần này còn {formatVnd(due - extra)}</p> : null}
      <Btn type="submit" className="w-full">
        {extra ? `Thu ${formatVnd(extra)} · ${method === "cash" ? "tiền mặt" : "chuyển khoản"}` : `Thu đủ ${formatVnd(due)} · ${method === "cash" ? "tiền mặt" : "chuyển khoản"}`}
      </Btn>
    </form>
  );
}
