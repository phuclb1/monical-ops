"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChefHat,
  ClipboardList,
  DoorOpen,
  FileText,
  Handshake,
  Menu,
  ShieldAlert,
  TimerReset,
  Users,
  BarChart3,
  ConciergeBell,
} from "lucide-react";
import clsx from "clsx";
import { PRIMARY_NAV } from "@/lib/nav";

const ICONS: Record<string, typeof CalendarDays> = {
  "/today": CalendarDays,
  "/tasks": ClipboardList,
  "/rooms": DoorOpen,
  "/handover": Handshake,
  "/more": Menu,
  "/reception": ConciergeBell,
  "/kitchen": ChefHat,
  "/shifts": TimerReset,
  "/forms": FileText,
  "/incidents": ShieldAlert,
  "/reports": BarChart3,
  "/staff": Users,
  "/notifications": Bell,
};

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#fffdf8]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 px-1 pb-1 pt-1">
        {PRIMARY_NAV.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`);
          const Icon = ICONS[item.href] ?? Menu;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-burgundy" : "text-[#8a7a72]",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ extras }: { extras: { href: string; label: string }[] }) {
  const path = usePathname();
  const primary = PRIMARY_NAV.filter((item) => item.href !== "/more");
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
      {primary.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        const Icon = ICONS[item.href] ?? Menu;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
              active ? "bg-burgundy text-cream" : "text-[#3d2a2a] hover:bg-white",
            )}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
      <p className="mt-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#8a7a72]">Điều hành</p>
      {extras.map((item) => {
        const active = path === item.href || path.startsWith(`${item.href}/`);
        const Icon = ICONS[item.href] ?? Menu;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
              active ? "bg-burgundy text-cream" : "text-[#3d2a2a] hover:bg-white",
            )}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
