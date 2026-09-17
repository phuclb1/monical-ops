"use client";

import { useState } from "react";
import { recordBookingPaymentAction } from "@/actions/sales";
import { Btn, Field } from "@/components/ui";
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
  const previewDue = Math.max(0, due - extra);

  if (due <= 0) {
    return <p className="text-sm font-semibold text-[#1b7a4e]">Đã thu đủ {formatVnd(deposit)}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5c6665]">
        Trả thêm trước check-in: nhập số tiền lần này rồi Ghi nhận — phần mềm cộng vào tổng đã thu, không ghi đè cọc cũ.
        Lúc nhận phòng trả hết: bấm Thu đủ, rồi Nhận trên từng phòng.
      </p>
      <form action={recordBookingPaymentAction} className="space-y-2 rounded-xl border border-line p-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Số tiền vừa thu (₫)">
          <input
            name="amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(due)}
          />
        </Field>
        {extra ? (
          <p className="text-xs text-[#5c6665]">
            Sau lần này còn {formatVnd(previewDue)}
          </p>
        ) : null}
        <Btn type="submit" className="w-full" disabled={!extra}>
          Ghi nhận thu thêm
        </Btn>
      </form>
      <form action={recordBookingPaymentAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="settle" value="1" />
        <Btn type="submit" variant="ghost" className="w-full">
          Thu đủ {formatVnd(due)}
        </Btn>
      </form>
    </div>
  );
}
