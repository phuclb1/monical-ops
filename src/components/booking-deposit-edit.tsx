import { updateBookingDepositAction } from "@/actions/sales";
import { PendingSubmit } from "@/components/pending-submit";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

export function BookingDepositEdit({
  bookingId,
  txId,
  amount,
  method,
  label,
}: {
  bookingId: string;
  txId?: string;
  amount: number;
  method: PaymentMethod;
  label?: string;
}) {
  const held = Math.max(0, Math.round(amount || 0));
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-teal">
        {label || (held ? "Sửa số cọc" : "Ghi số cọc")}
      </summary>
      <form action={updateBookingDepositAction} className="mt-2 space-y-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        {txId ? <input type="hidden" name="txId" value={txId} /> : null}
        <div className="flex items-center gap-2">
          <input
            name="amount"
            inputMode="numeric"
            defaultValue={held ? String(held) : ""}
            placeholder="0"
            aria-label="Số tiền đặt cọc"
            className="min-w-0 flex-1"
            style={{ width: "auto" }}
          />
          <select
            name="paymentMethod"
            aria-label="Hình thức đặt cọc"
            defaultValue={method}
            className="shrink-0"
            style={{ width: "10.75rem" }}
          >
            {PAYMENT_METHODS.map((item) => (
              <option key={item} value={item}>
                {PAYMENT_METHOD_LABEL[item]}
              </option>
            ))}
          </select>
        </div>
        {held ? <p className="text-xs text-[#5c6665]">Nhập 0 để xóa khoản đặt cọc này.</p> : null}
        <PendingSubmit className="w-full" pendingLabel="Đang lưu...">
          Lưu cọc
        </PendingSubmit>
      </form>
    </details>
  );
}
