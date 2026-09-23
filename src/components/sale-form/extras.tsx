"use client";

import { useMemo, useState } from "react";
import { Btn, Field } from "@/components/ui";
import { extraAmount, extraQtyLabel } from "@/lib/extras";
import { formatVnd, parseMoney } from "@/lib/sales";

export type ExtraTypeOption = { id: string; name: string; unitPrice: number; unit: string; unitLabel?: string | null };

export type DraftExtra = {
  key: string;
  typeId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit: string;
};

export function SaleFormExtras({
  types,
  nights,
  extras,
  setExtras,
}: {
  types: ExtraTypeOption[];
  nights: number;
  extras: DraftExtra[];
  setExtras: (value: DraftExtra[] | ((prev: DraftExtra[]) => DraftExtra[])) => void;
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

  function addExtra() {
    if (!canAdd) return;
    const row: DraftExtra = other
      ? { key: `x-${Date.now()}`, typeId: "other", name: otherName.trim(), qty: 1, unitPrice: parseMoney(otherAmount), unit: "once" }
      : {
          key: `x-${Date.now()}`,
          typeId: selected?.id || "",
          name: selected?.name || "",
          qty: Math.max(1, Number(qty) || 1),
          unitPrice: selected?.unitPrice || 0,
          unit: selected?.unit || "once",
        };
    setExtras((prev) => [...prev, row]);
    setQty("1");
    setOtherName("");
    setOtherAmount("");
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#5c6665]">Phụ thu</p>
      {extras.length ? (
        <ul className="space-y-2">
          {extras.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-2 rounded-xl bg-sand px-3 py-2">
              <input type="hidden" name="extraType" value={row.typeId || "other"} />
              <input type="hidden" name="extraQty" value={row.qty} />
              <input type="hidden" name="extraName" value={row.name} />
              <input type="hidden" name="extraAmount" value={row.unitPrice} />
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
                <span className="text-sm font-semibold">{formatVnd(extraAmount(row, nights))}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#c23b3b]"
                  onClick={() => setExtras((prev) => prev.filter((item) => item.key !== row.key))}
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#5c6665]">Phụ thu người lớn / trẻ em / đệm theo đêm, giặt theo kg, hoặc nhập tên + tiền.</p>
      )}
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
      {other ? (
        <>
          <Field label="Tên">
            <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Xe đón, hoa..." />
          </Field>
          <Field label="Số tiền (₫)">
            <input inputMode="numeric" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} placeholder="50000" />
          </Field>
        </>
      ) : (
        <Field label={extraQtyLabel(selected?.unit || "once")}>
          <input inputMode="numeric" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      )}
      <p className="text-xs text-[#5c6665]">Tạm tính {formatVnd(preview)}</p>
      <Btn type="button" className="w-full" disabled={!canAdd} onClick={addExtra}>
        Thêm phụ thu
      </Btn>
    </div>
  );
}
