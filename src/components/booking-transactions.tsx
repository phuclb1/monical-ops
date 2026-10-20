import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/datetime";
import { BOOKING_TX_KIND_LABEL, formatVnd, isBookingTxKind } from "@/lib/sales";

export function BookingTransactionList({
  rows,
}: {
  rows: {
    id: string;
    kind: string;
    amount: number;
    method: string;
    paidAt: string;
    note?: string | null;
    photo?: string | null;
  }[];
}) {
  if (!rows.length) {
    return <p className="text-xs text-[#8a918f]">Chưa có giao dịch.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const kind = isBookingTxKind(row.kind) ? row.kind : "payment";
        const refund = kind === "refund";
        const method = row.method in PAYMENT_METHOD_LABEL ? PAYMENT_METHOD_LABEL[row.method as keyof typeof PAYMENT_METHOD_LABEL] : row.method;
        return (
          <li key={row.id} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className={refund ? "font-semibold text-[#c23b3b]" : "font-semibold"}>
                {BOOKING_TX_KIND_LABEL[kind]} {refund ? "−" : ""}
                {formatVnd(row.amount)}
              </p>
              <p className="text-xs text-[#5c6665]">
                {formatDateTime(row.paidAt)} · {method}
                {row.note ? ` · ${row.note}` : ""}
              </p>
            </div>
            {row.photo ? (
              <a href={row.photo} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={row.photo} alt="Bill" className="h-12 w-12 rounded-lg object-cover" />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}