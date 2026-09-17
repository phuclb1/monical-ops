"use client";

import { Btn } from "./ui";

export function PrintButton({ label = "In phiếu" }: { label?: string }) {
  return (
    <Btn type="button" className="w-full" onClick={() => window.print()}>
      {label}
    </Btn>
  );
}
