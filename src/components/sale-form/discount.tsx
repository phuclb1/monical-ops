"use client";

import { Field } from "@/components/ui";
import { DISCOUNT_KIND_LABEL } from "@/lib/constants";
import { DISCOUNT_KINDS, type DiscountKind } from "@/lib/types";
import type { DiscountState } from "./shared";

export function RoomDiscountFields({
  namePrefix,
  discount,
  onChange,
}: {
  namePrefix: string;
  discount: DiscountState;
  onChange: (next: DiscountState) => void;
}) {
  return (
    <div className="sale-room-ck grid grid-cols-2 gap-2">
      <Field label="Chiết khấu">
        <select
          name={`discountKind-${namePrefix}`}
          value={discount.kind}
          onChange={(e) =>
            onChange({
              kind: e.target.value as DiscountKind,
              value: e.target.value === discount.kind ? discount.value : "",
            })
          }
        >
          {DISCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {DISCOUNT_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={discount.kind === "percent" ? "Mức %" : "Số tiền (₫)"}>
        <input
          name={`discountValue-${namePrefix}`}
          inputMode="numeric"
          value={discount.kind === "none" ? "" : discount.value}
          disabled={discount.kind === "none"}
          onChange={(e) => onChange({ ...discount, value: e.target.value })}
          placeholder={discount.kind === "percent" ? "10" : "0"}
        />
      </Field>
    </div>
  );
}
