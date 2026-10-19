"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { recordBookingRefundAction } from "@/actions/sales";
import { Btn, PayMethodField } from "@/components/ui";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatVnd, parseMoney, stayNightlyRate, stayRefundQuote, type StayRefundReason } from "@/lib/sales";
import type { PaymentMethod } from "@/lib/types";

const REASONS: { id: StayRefundReason; label: string; hint: string }[] = [
  { id: "early_out", label: "Trả sớm", hint: "Hoàn đủ giá đêm chưa ở" },
  { id: "cancel_night", label: "Hủy đêm", hint: "Khách mất 50%, hoàn 50%" },
  { id: "other", label: "Số khác", hint: "Nhập số tiền hoàn" },
];

export function BookingRefundPanel({
  bookingId,
  collected,
  refunded,
  refundable,
  overpay,
  roomTotal,
  nights,
  defaultMethod,
  back,
}: {
  bookingId: string;
  collected: number;
  refunded: number;
  refundable: number;
  overpay: number;
  roomTotal: number;
  nights: number;
  defaultMethod: PaymentMethod;
  back?: string;
}) {
  const nightly = stayNightlyRate(roomTotal, nights);
  const defaultNights = nightly > 0 && overpay > 0 ? Math.max(1, Math.round(overpay / nightly)) : 1;
  const [reason, setReason] = useState<StayRefundReason>("early_out");
  const [nightCount, setNightCount] = useState(String(defaultNights));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [confirmed, setConfirmed] = useState(false);

  const quoted = useMemo(() => {
    const parsedNights = Math.max(1, Number(nightCount.replace(/[^\d]/g, "")) || 1);
    return stayRefundQuote({
      reason,
      nights: parsedNights,
      roomTotal,
      stayNights: nights,
      amount: parseMoney(amount),
    });
  }, [amount, nightCount, nights, reason, roomTotal]);

  const payable = Math.min(refundable, reason === "other" ? parseMoney(amount) || quoted : quoted);
  const nightsValue = Math.max(1, Number(nightCount.replace(/[^\d]/g, "")) || 1);

  if (refundable <= 0) return null;

  return (
    <form action={recordBookingRefundAction} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <input type="hidden" name="reason" value={reason} />
      {reason !== "other" ? <input type="hidden" name="amount" value={String(payable)} /> : null}
      {confirmed ? <input type="hidden" name="refunded" value="1" /> : null}

      <p className="text-xs font-semibold text-[#5c6665]">Hoàn tiền</p>
      <p className="text-xs text-[#5c6665]">
        Đã thu {formatVnd(collected)}
        {refunded ? ` · đã hoàn ${formatVnd(refunded)}` : ""}
        {` · còn hoàn được ${formatVnd(refundable)}`}
      </p>
      {overpay > 0 ? (
        <p className="text-xs text-[#c47b12]">Checkout sớm còn thừa khoảng {formatVnd(overpay)}.</p>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Lý do</legend>
        <div className="grid grid-cols-1 gap-2">
          {REASONS.map((row) => (
            <label key={row.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
              <input type="radio" checked={reason === row.id} onChange={() => setReason(row.id)} />
              <span>
                {row.label}
                <span className="block text-xs font-medium text-[#5c6665]">{row.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {reason !== "other" ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">
            Số đêm · {formatVnd(nightly)}/đêm
          </span>
          <input
            inputMode="numeric"
            value={nightCount}
            onChange={(event) => setNightCount(event.target.value)}
          />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Số tiền hoàn</span>
          <input
            name="amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={String(refundable)}
          />
        </label>
      )}

      <PayMethodField label="Hoàn từ tài khoản" value={method} onChange={setMethod} />

      {payable > 0 ? (
        <p className="text-xs text-[#5c6665]">
          {reason === "cancel_night"
            ? `${nightsValue} đêm × 50% = ${formatVnd(payable)}`
            : reason === "early_out"
              ? `${nightsValue} đêm × giá đêm = ${formatVnd(payable)}`
              : `Hoàn ${formatVnd(payable)}`}
        </p>
      ) : null}

      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        Đã hoàn {formatVnd(payable)} từ {PAYMENT_METHOD_LABEL[method]}
      </label>

      <SubmitBtn disabled={!confirmed || payable <= 0}>
        {payable > 0 ? `Ghi hoàn ${formatVnd(payable)}` : "Ghi hoàn tiền"}
      </SubmitBtn>
    </form>
  );
}

function SubmitBtn({ children, disabled }: { children: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Btn type="submit" className="w-full" disabled={disabled || pending}>
      {pending ? "Đang lưu..." : children}
    </Btn>
  );
}
