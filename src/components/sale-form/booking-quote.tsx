"use client";

import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatVnd, paidNote } from "@/lib/sales";
import type { PaymentMethod } from "@/lib/types";

export function BookingQuote(props: {
  quotes: { line: { saleId: string; type: string }; room?: { type?: string } | null; kind: string | null; quote: { nights: number; gross?: number; subtotal: number; breakfastOff: number; discount: number }; discountKind: string; discountValue: number }[];
  extraRows: { name: string; qty: number; unitPrice: number; unit: string; amount: number }[];
  booked: { nights: number };
  bookingTotal: number;
  depositAmount: number;
  defaults: { cashPaid?: number; transferPaid?: number; companyPaid?: number; deposit?: number };
  payMethod: PaymentMethod;
  ota?: boolean;
  due: number;
}) {
  const { quotes, extraRows, booked, bookingTotal, depositAmount, defaults, payMethod, ota, due } = props;
  return (
      <div className="rounded-xl bg-sand px-3 py-2 text-sm">
        <ul className="space-y-1">
          {quotes.map((row) => (
            <li key={row.line.saleId}>
              <div className="flex justify-between gap-2">
                <span>
                  {row.room?.type || row.line.type}
                  {row.kind === "upgrade" ? ` · nâng` : ""} · {row.quote.nights} đêm
                </span>
                <span>{formatVnd(row.quote.gross ?? row.quote.subtotal + row.quote.breakfastOff)}</span>
              </div>
              {row.quote.breakfastOff ? (
                <div className="flex justify-between gap-2 text-xs text-[#c47b12]">
                  <span>Không ăn sáng</span>
                  <span>−{formatVnd(row.quote.breakfastOff)}</span>
                </div>
              ) : null}
              {row.quote.discount || row.discountKind !== "none" ? (
                <div className="flex justify-between gap-2 text-xs text-[#1b7a4e]">
                  <span>Chiết khấu{row.discountKind === "percent" ? ` ${row.discountValue}%` : ""}</span>
                  <span>−{formatVnd(row.quote.discount)}</span>
                </div>
              ) : null}
            </li>
          ))}
          {extraRows.map((row) => (
            <li key={`${row.name}-${row.qty}-${row.unitPrice}`} className="flex justify-between gap-2">
              <span>
                {row.name}
                {row.unit === "night" ? ` · ${row.qty} × ${booked.nights} đêm` : row.unit === "kg" ? ` · ${row.qty} kg` : ""}
              </span>
              <span>{formatVnd(row.amount)}</span>
            </li>
          ))}
          {ota ? (
            <>
              {depositAmount ? (
                <li className="flex justify-between gap-2 text-[#1b7a4e]">
                  <span>Đã thu{paidNote(defaults) ? ` · ${paidNote(defaults)}` : ""}</span>
                  <span>−{formatVnd(depositAmount)}</span>
                </li>
              ) : null}
              <li className="flex justify-between gap-2 font-bold">
                <span>Công nợ OTA</span>
                <span>{formatVnd(due)}</span>
              </li>
            </>
          ) : (
            <>
              <li className="flex justify-between gap-2">
                <span>Phải thu</span>
                <span>{formatVnd(bookingTotal)}</span>
              </li>
              {depositAmount ? (
                <li className="flex justify-between gap-2 text-[#1b7a4e]">
                  <span>Đã đặt cọc{paidNote(defaults) ? ` · ${paidNote(defaults)}` : ` · ${PAYMENT_METHOD_LABEL[payMethod]}`}</span>
                  <span>−{formatVnd(depositAmount)}</span>
                </li>
              ) : (
                <li className="text-[#c47b12]">Chưa đặt cọc</li>
              )}
              <li className="flex justify-between gap-2 font-bold">
                <span>Còn phải thu</span>
                <span>{formatVnd(due)}</span>
              </li>
            </>
          )}
        </ul>
      </div>
  );
}
