"use client";

import { Printer } from "lucide-react";
import { Btn } from "./ui";

function printNow(fileBaseName?: string) {
  const previous = document.title;
  if (fileBaseName) {
    document.title = fileBaseName;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
  }
  window.print();
}

export function PrintButton({
  label = "In phiếu",
  fileBaseName,
  compact,
}: {
  label?: string;
  fileBaseName?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button type="button" className="breakfast-print-btn" onClick={() => printNow(fileBaseName)}>
        <Printer size={16} />
        {label}
      </button>
    );
  }
  return (
    <Btn type="button" className="w-full" onClick={() => printNow(fileBaseName)}>
      {label}
    </Btn>
  );
}
