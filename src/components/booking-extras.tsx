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
  const [typeId, setTypeId] = useState(types[0]?.id || "other");
  const [qty, setQty] = useState("1");
  const [otherName, setOtherName] = useState("");
  const [otherAmount, setOtherAmount] = useState("");
  const other = typeId === "other";
  const selected = types.find((row) => row.id === typeId);
  const preview = useMemo(() => {
    if (other) return parseMoney(otherAmount);
    if (!selected) return 0;
    return extraAmount({ qty: Math.max(1, Number(qty) || 1), unitPrice: selected.unitPrice, unit: selected.unit }, nights);
  }, [other, otherAmount, selected, qty, nights]);
  const canAdd = other ? Boolean(otherName.trim() && parseMoney(otherAmount)) : Boolean(selected);

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
        <p className="text-xs text-[#5c6665]">Phụ thu người lớn / trẻ em / đệm theo đêm, giặt 50k/kg, hoặc nhập tên + tiền.</p>
      )}

      <form action={addBookingExtraAction} className="space-y-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Dịch vụ">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {formatVnd(row.unitPrice)}/{row.unitLabel || row.unit}
              </option>
            ))}
            <option value="other">Phụ thu khác</option>
          </select>
        </Field>
        {other ? null : <input type="hidden" name="typeId" value={typeId} />}
        {other ? (
          <>
            <Field label="Tên">
              <input name="name" value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Xe đón, hoa..." />
            </Field>
            <Field label="Số tiền (₫)">
              <input name="amount" inputMode="numeric" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="50000" />
            </Field>
          </>
        ) : (
          <Field label={extraQtyLabel(selected?.unit || "once")}>
            <input name="qty" inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        )}
        <p className="text-xs text-[#5c6665]">Tạm tính {formatVnd(preview)}</p>
        <Btn type="submit" className="w-full" disabled={!canAdd}>
          Thêm dịch vụ
        </Btn>
      </form>
    </div>
  );
}
