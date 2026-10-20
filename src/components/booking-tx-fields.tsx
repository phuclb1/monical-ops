"use client";

import { useRef, useState } from "react";
import { datetimeLocalVN } from "@/lib/datetime";
import { compressImage } from "@/lib/image";

export function BookingTxFields({
  defaultPaidAt,
  showNote = true,
}: {
  defaultPaidAt?: string;
  showNote?: boolean;
}) {
  const [paidAt, setPaidAt] = useState(datetimeLocalVN(defaultPaidAt));
  const [photo, setPhoto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Thời gian</span>
        <input type="datetime-local" name="paidAt" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </label>
      {showNote ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[#5c6665]">Ghi chú</span>
          <input name="note" placeholder="CK phụ, mã giao dịch..." />
        </label>
      ) : null}
      <input type="hidden" name="photo" value={photo} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void compressImage(file).then(setPhoto);
          }}
        />
        {photo ? (
          <button
            type="button"
            className="text-xs font-semibold text-[#c23b3b]"
            onClick={() => {
              setPhoto("");
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Xóa ảnh
          </button>
        ) : (
          <span className="text-xs text-[#8a918f]">Ảnh bill/CK — tuỳ chọn</span>
        )}
      </div>
      {photo ? <img src={photo} alt="Bill" className="h-16 w-16 rounded-lg object-cover" /> : null}
    </div>
  );
}