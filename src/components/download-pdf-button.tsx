"use client";

import { useState } from "react";
import { Btn } from "./ui";

export function DownloadPdfButton({ filename }: { filename: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const pages = [...document.querySelectorAll(".booking-sheet-page")].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    const nodes = pages.length ? pages : [document.querySelector(".booking-sheet")].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (!nodes.length) return;
    setBusy(true);
    const fit = document.querySelector<HTMLElement>(".booking-sheet-fit");
    const frame = document.querySelector<HTMLElement>(".booking-sheet-frame");
    const previousZoom = fit?.style.zoom;
    const previousOverflow = frame?.style.overflow;
    if (fit) fit.style.zoom = "1";
    if (frame) frame.style.overflow = "visible";
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      let first = true;
      for (const page of nodes) {
        const canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        });
        const img = canvas.toDataURL("image/jpeg", 0.92);
        const imgH = (canvas.height * usableW) / canvas.width;
        let remaining = imgH;
        let offset = margin;
        if (!first) pdf.addPage();
        pdf.addImage(img, "JPEG", margin, offset, usableW, imgH);
        remaining -= usableH;
        first = false;
        while (remaining > 1) {
          offset = margin - (imgH - remaining);
          pdf.addPage();
          pdf.addImage(img, "JPEG", margin, offset, usableW, imgH);
          remaining -= usableH;
        }
      }
      pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    } finally {
      if (fit) fit.style.zoom = previousZoom || "";
      if (frame) frame.style.overflow = previousOverflow || "";
      setBusy(false);
    }
  }

  return (
    <Btn type="button" variant="ghost" className="w-full" onClick={download} disabled={busy}>
      {busy ? "Đang tạo PDF…" : "Tải PDF"}
    </Btn>
  );
}
