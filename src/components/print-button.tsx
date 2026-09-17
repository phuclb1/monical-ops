"use client";

import { Btn } from "./ui";

export function PrintButton({ label = "In phiếu", fileBaseName }: { label?: string; fileBaseName?: string }) {
  return (
    <Btn
      type="button"
      className="w-full"
      onClick={() => {
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
      }}
    >
      {label}
    </Btn>
  );
}
