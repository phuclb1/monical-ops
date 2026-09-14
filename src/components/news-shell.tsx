import Link from "next/link";
import { Logo } from "@/components/logo";
import { HOTEL_NAME } from "@/lib/constants";
import type { ReactNode } from "react";

export function NewsShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-sand">
      <header className="border-b border-line bg-[#fff8ee]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/tin-tuc" className="flex min-h-11 items-center gap-3">
            <div className="overflow-hidden rounded-lg bg-burgundy">
              <Logo className="h-11 w-[34px] object-cover object-[center_8%]" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy">{HOTEL_NAME}</p>
              <p className="text-sm font-semibold">Tin tức</p>
            </div>
          </Link>
          <Link href="/tin-tuc" className="text-sm font-semibold text-burgundy">
            Tất cả bài
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16 md:py-10">{children}</main>
      <footer className="border-t border-line bg-[#fff8ee]">
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-[#6b5a52]">
          <p className="font-semibold text-ink">{HOTEL_NAME}</p>
          <p className="mt-1">Khách sạn gần trung tâm Đà Lạt — Hồ Xuân Hương, chợ đêm, Quảng trường Lâm Viên.</p>
        </div>
      </footer>
    </div>
  );
}
