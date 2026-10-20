"use client";

import { settleOtaDebtAction } from "@/actions/sales";
import { BookingTxFields } from "@/components/booking-tx-fields";
import { Btn } from "@/components/ui";
import { formatVnd } from "@/lib/sales";

export function BookingOtaSettlePanel({
  bookingId,
  amount,
  settledAt,
}: {
  bookingId: string;
  amount: number;
  settledAt?: string | null;
}) {
  if (settledAt) {
    return <p className="text-sm font-semibold text-[#1b7a4e]">Đã nhận tiền OTA</p>;
  }
  if (amount <= 0) return null;
  return (
    <form action={settleOtaDebtAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-xs font-semibold text-[#5c6665]">Nhận tiền OTA</p>
      <p className="text-sm">Công nợ còn {formatVnd(amount)}. Một lần = nhận đủ.</p>
      <BookingTxFields />
      <Btn type="submit" className="w-full">
        Đã nhận tiền OTA {formatVnd(amount)}
      </Btn>
    </form>
  );
}