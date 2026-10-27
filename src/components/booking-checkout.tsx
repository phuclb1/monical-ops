"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { checkoutBookingRoomAction } from "@/actions/sales";
import { PendingSubmit } from "@/components/pending-submit";
import { Btn } from "@/components/ui";
import { formatVnd } from "@/lib/sales";

export function BookingCheckoutButton({
  bookingId,
  saleId,
  due,
}: {
  bookingId: string;
  saleId: string;
  due: number;
}) {
  const unpaid = due > 0;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!unpaid) {
    return (
      <form action={checkoutBookingRoomAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="id" value={saleId} />
        <PendingSubmit variant="gold" pendingLabel="Đang trả phòng...">
          Check out
        </PendingSubmit>
      </form>
    );
  }

  return (
    <>
      <Btn type="button" variant="gold" onClick={() => setOpen(true)}>
        Check out
      </Btn>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] grid place-items-center bg-[rgb(43_24_24_/_35%)] p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkout-unpaid-title"
              onClick={() => setOpen(false)}
            >
              <div className="card w-full max-w-sm p-4" onClick={(event) => event.stopPropagation()}>
                <h2 id="checkout-unpaid-title" className="font-bold">
                  Chưa thu đủ tiền
                </h2>
                <p className="mt-2 text-sm">
                  Còn phải thu {formatVnd(due)}. Thu đủ ở phần Thanh toán rồi mới được check out.
                </p>
                <div className="mt-4">
                  <Btn type="button" className="w-full" onClick={() => setOpen(false)}>
                    Đóng để thu tiền
                  </Btn>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
