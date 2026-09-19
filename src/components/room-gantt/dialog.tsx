"use client";

import { Btn } from "@/components/ui";
import { formatDateNumeric } from "@/lib/datetime";
import { formatVnd, nightsBetween } from "@/lib/sales";
import type { ConfirmState, GanttSale } from "./model";

export function GanttUpgradeDialog(props: {
  confirm: ConfirmState;
  pending: boolean;
  roomOf: (id: string) => { type: string; number: string } | undefined;
  onCancel: () => void;
  onConfirm: (sale: GanttSale, roomId: string, checkIn: string, checkOut: string) => void;
}) {
  const { confirm, pending, roomOf, onCancel, onConfirm } = props;
  return (
        <div className="gantt-dialog-back" role="dialog" aria-modal="true">
          <div className="gantt-dialog card p-4">
            <h2 className="font-bold">Nâng hạng phòng</h2>
            <p className="mt-2 text-sm">
              {roomOf(confirm.sale.roomId)?.type || "—"} P.{roomOf(confirm.sale.roomId)?.number} → {confirm.room.type} P.
              {confirm.room.number}
            </p>
            <p className="mt-1 text-sm text-[#5c6665]">
              {formatDateNumeric(confirm.checkIn)} → {formatDateNumeric(confirm.checkOut)} · {nightsBetween(confirm.checkIn, confirm.checkOut)} đêm
            </p>
            {confirm.extra > 0 ? (
              <p className="mt-2 text-sm font-semibold">Phải thu thêm {formatVnd(confirm.extra)}</p>
            ) : (
              <p className="mt-2 text-sm text-[#5c6665]">Giá không tăng — chỉ đổi hạng.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Hủy
              </Btn>
              <Btn
                type="button"
                onClick={() => onConfirm(confirm.sale, confirm.room.id, confirm.checkIn, confirm.checkOut)}
                disabled={pending}
              >
                Đồng ý
              </Btn>
            </div>
          </div>
        </div>
  );
}
