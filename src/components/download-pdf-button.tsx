"use client";

import { useState } from "react";
import { Btn } from "./ui";

export function DownloadPdfButton({ filename }: { filename: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const node = document.querySelector(".booking-sheet");
    if (!(node instanceof HTMLElement)) return;
    setBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      let remaining = imgH;
      let offset = margin;
      pdf.addImage(img, "JPEG", margin, offset, usableW, imgH);
      remaining -= usableH;
      while (remaining > 1) {
        offset = margin - (imgH - remaining);
        pdf.addPage();
        pdf.addImage(img, "JPEG", margin, offset, usableW, imgH);
        remaining -= usableH;
      }
      pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Btn type="button" variant="ghost" className="w-full" onClick={download} disabled={busy}>
      {busy ? "Đang tạo PDF…" : "Tải PDF"}
    </Btn>
  );
}
