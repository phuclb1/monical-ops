"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveCheckItemAction, skipCheckAction, toggleCheckAction } from "@/actions/ops";
import { CHECKLIST_KIND_LABEL, isChecklistKind } from "@/lib/checklists";
import { Chip } from "@/components/ui";

export type ChecklistItemView = {
  id: string;
  label: string;
  required: boolean;
  done: boolean;
  skipReason: string | null;
  note: string | null;
  photo: string | null;
};

export type ChecklistView = {
  id: string;
  kind: string;
  title: string;
  taskId?: string | null;
  items: ChecklistItemView[];
};

const MAX_PHOTO_BYTES = 200 * 1024;

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không nén được ảnh");
  ctx.drawImage(bitmap, 0, 0, width, height);
  let quality = 0.82;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > MAX_PHOTO_BYTES * 1.37 && quality > 0.4) {
    quality -= 0.12;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  return data;
}

function ItemRow({ item }: { item: ChecklistItemView }) {
  const [note, setNote] = useState(item.note || "");
  const [reason, setReason] = useState(item.skipReason || "");
  const [photo, setPhoto] = useState(item.photo || "");
  const [done, setDone] = useState(item.done);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDone(item.done);
  }, [item.done]);

  return (
    <li className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-start gap-2">
        <form
          action={(formData) => {
            setDone((value) => !value);
            start(() => toggleCheckAction(formData));
          }}
        >
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="hit-check mt-0.5 flex items-center justify-center rounded-lg border border-line bg-white text-sm font-bold">
            {done ? "✓" : ""}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <p className={done ? "text-sm line-through text-[#8a918f]" : "text-sm font-medium"}>{item.label}</p>
          {item.required ? <p className="text-[11px] text-[#c47b12]">Bắt buộc</p> : <p className="text-[11px] text-[#8a918f]">Không bắt buộc</p>}
          {item.skipReason ? <p className="text-[11px] text-[#9a5b00]">Bỏ qua: {item.skipReason}</p> : null}
        </div>
      </div>

      <form
        action={(formData) => start(() => saveCheckItemAction(formData))}
        className="mt-2 space-y-2"
      >
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="photo" value={photo} />
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ghi chú (tuỳ chọn)"
          className="min-h-9 w-full"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              start(async () => {
                const data = await compressImage(file);
                setPhoto(data);
              });
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
            <span className="text-[11px] text-[#8a918f]">Ảnh tuỳ chọn</span>
          )}
        </div>
        {photo ? <img src={photo} alt="" className="max-h-32 rounded-lg border border-line object-cover" /> : null}
        <button className="rounded-lg bg-white px-2 py-1 text-xs font-semibold" disabled={pending}>
          Lưu ghi chú / ảnh
        </button>
      </form>

      {!item.done && item.required ? (
        <form action={skipCheckAction} className="mt-2 flex gap-1">
          <input type="hidden" name="itemId" value={item.id} />
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do bỏ qua"
            className="min-h-9"
            required
          />
          <button className="rounded-lg bg-white px-2 text-xs font-semibold">Bỏ qua</button>
        </form>
      ) : null}
    </li>
  );
}

export function ChecklistPanel({ list, hint }: { list: ChecklistView; hint?: string }) {
  const kindLabel = isChecklistKind(list.kind) ? CHECKLIST_KIND_LABEL[list.kind] : list.title;
  const pending = list.items.filter((item) => item.required && !item.done && !item.skipReason).length;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{list.title || kindLabel}</h2>
          {hint ? <p className="text-xs text-[#5c6665]">{hint}</p> : null}
        </div>
        <Chip tone={pending ? "warn" : "ok"}>{pending ? `${pending} còn` : "Xong"}</Chip>
      </div>
      <ul className="space-y-2">
        {list.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
