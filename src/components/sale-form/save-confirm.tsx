"use client";

import { Btn } from "@/components/ui";
import { SALE_SOURCE_LABEL } from "@/lib/constants";
import type { SaleSource } from "@/lib/types";

export type SaveConfirmLine = { id: string; title: string; detail: string };
export type SaveConfirmMoney = { label: string; value: string; emphasis?: boolean };

export function BookingSaveDialog(props: {
  guestName: string;
  guestPhone: string;
  source: string;
  lines: SaveConfirmLine[];
  money: SaveConfirmMoney[];
  note?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { guestName, guestPhone, source, lines, money, note, confirmLabel, onCancel, onConfirm } = props;
  const channel = source in SALE_SOURCE_LABEL ? SALE_SOURCE_LABEL[source as SaleSource] : source;
  return (
    <div className="gantt-dialog-back" role="dialog" aria-modal="true" aria-labelledby="save-confirm-title">
      <div className="gantt-dialog card max-h-[85vh] overflow-y-auto p-4">
        <h2 id="save-confirm-title" className="font-bold">Xác nhận lưu booking</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#5c6665]">Khách</dt>
            <dd className="text-right font-semibold">{guestName || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#5c6665]">SĐT</dt>
            <dd className="text-right">{guestPhone || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#5c6665]">Nền tảng</dt>
            <dd className="text-right">{channel}</dd>
          </div>
        </dl>
        <ul className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
          {lines.map((line) => (
            <li key={line.id}>
              <p className="font-semibold">{line.title}</p>
              <p className="text-[#5c6665]">{line.detail}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {money.map((row) => (
            <li key={row.label} className={`flex justify-between gap-3 ${row.emphasis ? "font-bold" : ""}`}>
              <span>{row.label}</span>
              <span>{row.value}</span>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-3 text-xs text-[#9a5b00]">{note}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Btn type="button" variant="ghost" onClick={onCancel}>
            Quay lại
          </Btn>
          <Btn type="button" onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
