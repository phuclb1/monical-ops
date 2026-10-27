"use client";

import { useEffect } from "react";
import { fallbackPwaHome } from "@/lib/pwa-recover";

export default function AppError() {
  useEffect(() => {
    fallbackPwaHome();
  }, []);

  return (
    <main className="mx-auto max-w-md space-y-3 px-4 py-10">
      <h1 className="text-xl font-bold">Trang này không tải được</h1>
      <p className="text-sm text-[#5c6665]">Đang mở lại trang chủ.</p>
      <a href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
        Về trang chủ
      </a>
    </main>
  );
}
