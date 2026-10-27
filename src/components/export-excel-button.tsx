"use client";

import { useRef, useState } from "react";
import { Btn } from "@/components/ui";

export function ExportExcelButton({ href }: { href: string }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const lock = useRef(false);

  async function download() {
    if (pending || lock.current) return;
    lock.current = true;
    setPending(true);
    setNote("");
    try {
      const response = await fetch(href);
      if (response.status === 429) {
        setNote("Đang xuất quá nhanh. Hãy đợi một lát.");
        return;
      }
      if (!response.ok) {
        setNote("Không xuất được file.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      link.href = url;
      link.download = match?.[1] || "dong-tien.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote("Không xuất được file.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Btn type="button" className="min-h-11 px-3" disabled={pending} aria-busy={pending || undefined} onClick={download}>
        {pending ? "Đang xuất..." : "Xuất Excel"}
      </Btn>
      {note ? <p className="max-w-40 text-right text-xs font-medium text-[#c23b3b]">{note}</p> : null}
    </div>
  );
}
