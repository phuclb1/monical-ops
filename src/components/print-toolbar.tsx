"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PrintButton } from "./print-button";
import { Btn } from "./ui";

const DownloadPdfButton = dynamic(
  () => import("./download-pdf-button").then((mod) => mod.DownloadPdfButton),
  {
    ssr: false,
    loading: () => (
      <Btn type="button" variant="ghost" className="w-full" disabled>
        Tải PDF
      </Btn>
    ),
  },
);

export function PrintToolbar({
  backHref,
  filename,
  fileBaseName,
}: {
  backHref: string;
  filename: string;
  fileBaseName: string;
}) {
  return (
    <div className="print-toolbar">
      <Link href={backHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
        ← Đặt phòng
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <PrintButton fileBaseName={fileBaseName} />
        <DownloadPdfButton filename={filename} />
        <Link href={backHref} className="print-toolbar-ghost col-span-2">
          Đóng
        </Link>
      </div>
    </div>
  );
}
