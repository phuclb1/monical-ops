"use client";

import { useMemo, useState } from "react";
import { addBookingExtraAction, removeBookingExtraAction } from "@/actions/sales";
import { Btn, Field } from "@/components/ui";
import { extraAmount, extraQtyLabel } from "@/lib/extras";
import { formatVnd, parseMoney } from "@/lib/sales";

type ExtraType = { id: string; name: string; unitPrice: number; unit: string; unitLabel?: string | null };
type Extra = { id: string; name: string; qty: number; unitPrice: number; unit: string; amount: number };

export function BookingExtrasPanel({
  bookingId,
  nights,
  types,
  extras,
}: {
  bookingId: string;
  nights: number;
  types: ExtraType[];
  extras: Extra[];
}) {
  const [typeId, setTypeId] = useState(types[0]?.id || "");
  const [qty, setQty] = useState("1");
  const [otherName, setOtherName] = useState("");
  const [otherAmount, setOtherAmount] = useState("");
  const selected = types.find((row) => row.id === typeId) || types[0];
  const preview = useMemo(() => {
    if (!selected) return 0;
    return extraAmount({ qty: Math.max(1, Number(qty) || 1), unitPrice: selected.unitPrice, unit: selected.unit }, nights);
  }, [selected, qty, nights]);

  return (
    <div className="space-y-3">
      {extras.length ? (
        <ul className="space-y-2">
          {extras.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-2 rounded-xl bg-sand px-3 py-2">
              <div>
                <p className="text-sm font-semibold">{row.name}</p>
                <p className="text-xs text-[#5c6665]">
                  {row.unit === "night"
                    ? `${row.qty} × ${nights} đêm × ${formatVnd(row.unitPrice)}`
                    : row.unit === "kg"
                      ? `${row.qty} kg × ${formatVnd(row.unitPrice)}`
                      : formatVnd(row.unitPrice)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-semibold">{formatVnd(row.amount)}</span>
                <form action={removeBookingExtraAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <button type="submit" className="text-xs font-semibold text-[#c23b3b]">
                    Xóa
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#5c6665]">Chưa có phụ thu / dịch vụ kèm.</p>
      )}

      {types.length ? (
        <form action={addBookingExtraAction} className="space-y-2 rounded-xl border border-line p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <Field label="Dịch vụ bảng giá">
            <select name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {formatVnd(row.unitPrice)}/{row.unitLabel || row.unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label={extraQtyLabel(selected?.unit || "once")}>
            <input name="qty" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <p className="text-xs text-[#5c6665]">Tạm tính {formatVnd(preview)}</p>
          <Btn type="submit" className="w-full">
            Thêm dịch vụ
          </Btn>
        </form>
      ) : null}

      <form action={addBookingExtraAction} className="space-y-2 rounded-xl border border-line p-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Phụ thu khác — tên">
          <input name="name" value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Xe đón, hoa..." />
        </Field>
        <Field label="Số tiền (₫)">
          <input name="amount" inputMode="numeric" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="50000" />
        </Field>
        <Btn type="submit" variant="ghost" className="w-full" disabled={!otherName.trim() || !parseMoney(otherAmount)}>
          Thêm phụ thu khác
        </Btn>
      </form>
    </div>
  );
}
