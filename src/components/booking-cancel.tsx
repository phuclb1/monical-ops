"use client";

import { useEffect, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { cancelBookingAction, cancelSaleAction } from "@/actions/sales";
import { Btn } from "@/components/ui";
import { formatVnd } from "@/lib/sales";

type Mode = "cancel" | "no_show";

export function BookingCancelActions({
  kind,
  id,
  guestName,
  deposit,
  canNoShow,
  variant = "link",
}: {
  kind: "booking" | "sale";
  id: string;
  guestName: string;
  deposit: number;
  canNoShow?: boolean;
  variant?: "link" | "block";
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [refunded, setRefunded] = useState(false);
  const paid = Math.max(0, Math.round(deposit || 0));
  const needRefund = mode === "cancel" && paid > 0;
  const action = kind === "booking" ? cancelBookingAction : cancelSaleAction;
  const cancelLabel = kind === "booking" ? "Hủy booking" : "Hủy chỗ";

  useEffect(() => {
    if (!mode) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMode(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    setRefunded(false);
  }, [mode]);

  return (
    <>
      <div className={variant === "block" ? "grid grid-cols-2 gap-2" : "flex items-center justify-between gap-3 px-1"}>
        <Trigger variant={variant} tone="muted" onClick={() => setMode("cancel")}>
          {cancelLabel}
        </Trigger>
        {canNoShow ? (
          <Trigger variant={variant} tone="danger" onClick={() => setMode("no_show")}>
            No-show
          </Trigger>
        ) : variant === "block" ? (
          <span />
        ) : null}
      </div>

      {mode
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] grid place-items-center bg-[rgb(43_24_24_/_35%)] p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-booking-title"
              onClick={() => setMode(null)}
            >
              <form
                action={action}
                className="card w-full max-w-sm p-4"
                onClick={(event) => event.stopPropagation()}
              >
            {kind === "booking" ? <input type="hidden" name="bookingId" value={id} /> : <input type="hidden" name="id" value={id} />}
            {mode === "no_show" ? <input type="hidden" name="asNoShow" value="1" /> : null}
            {needRefund && refunded ? <input type="hidden" name="depositRefunded" value="1" /> : null}

            {mode === "cancel" && paid > 0 ? (
              <>
                <h2 id="cancel-booking-title" className="font-bold">
                  Xác nhận đã hoàn cọc
                </h2>
                <p className="mt-2 text-sm">
                  {guestName} · đã cọc {formatVnd(paid)}. Hoàn tiền cho khách rồi mới hủy trên hệ thống.
                </p>
                <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold">
                  <input type="checkbox" checked={refunded} onChange={(event) => setRefunded(event.target.checked)} />
                  Đã hoàn cọc {formatVnd(paid)}
                </label>
              </>
            ) : mode === "cancel" ? (
              <>
                <h2 id="cancel-booking-title" className="font-bold">
                  {cancelLabel}
                </h2>
                <p className="mt-2 text-sm">
                  {guestName} chưa đặt cọc. Xác nhận hủy?
                </p>
              </>
            ) : (
              <>
                <h2 id="cancel-booking-title" className="font-bold">
                  No-show
                </h2>
                <p className="mt-2 text-sm">
                  {guestName} không đến. Không hoàn cọc — ghi no-show?
                </p>
              </>
            )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Btn type="button" variant="ghost" onClick={() => setMode(null)}>
                    Đóng
                  </Btn>
                  <SubmitBtn disabled={needRefund && !refunded}>
                    {mode === "no_show" ? "Ghi no-show" : cancelLabel}
                  </SubmitBtn>
                </div>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Trigger({
  variant,
  tone,
  onClick,
  children,
}: {
  variant: "link" | "block";
  tone: "muted" | "danger";
  onClick: () => void;
  children: string;
}) {
  if (variant === "block") {
    return (
      <Btn type="button" variant={tone === "danger" ? "danger" : "ghost"} className="w-full" onClick={onClick}>
        {children}
      </Btn>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center text-sm font-semibold ${tone === "danger" ? "text-[#c23b3b]" : "text-[#5c6665]"}`}
    >
      {children}
    </button>
  );
}

function SubmitBtn({
  children,
  disabled,
}: {
  children: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Btn type="submit" variant="danger" disabled={disabled || pending}>
      {pending ? "Đang lưu..." : children}
    </Btn>
  );
}
