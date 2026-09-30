"use client";

import { Field } from "@/components/ui";

export type CommissionKind = "percent" | "amount";

export function OtaCommissionFields({
  kind,
  value,
  onKind,
  onValue,
}: {
  kind: CommissionKind;
  value: string;
  onKind: (kind: CommissionKind) => void;
  onValue: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Hoa hồng OTA">
        <select
          name="otaCommissionKind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value === "amount" ? "amount" : "percent";
            onKind(next);
            if (next !== kind) onValue("");
          }}
        >
          <option value="percent">%</option>
          <option value="amount">Số tiền</option>
        </select>
      </Field>
      <Field label={kind === "percent" ? "Mức %" : "Số tiền (₫)"}>
        <input
          name="otaCommissionValue"
          inputMode="numeric"
          value={value}
          placeholder={kind === "percent" ? "15" : "0"}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            if (!digits) {
              onValue("");
              return;
            }
            onValue(kind === "percent" ? String(Math.min(100, Number(digits))) : digits);
          }}
        />
      </Field>
    </div>
  );
}
