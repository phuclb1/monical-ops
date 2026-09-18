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
  ScrollText,
  ConciergeBell,
  BedDouble,
  BookMarked,
  Tag,
  Sparkles,
  Wallet,
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
  "/sales": BedDouble,
  "/sales/bookings": BookMarked,
  "/sales/extras": Sparkles,
  "/reports/sales": Wallet,
  "/owner": Wallet,
  "/owner/guests": Users,
  "/kitchen": ChefHat,
  "/shifts": TimerReset,
  "/forms": FileText,
  "/incidents": ShieldAlert,
  "/reports": BarChart3,
  "/audit": ScrollText,
  "/staff": Users,
  "/rooms/manage": Tag,
  "/notifications": Bell,
};

function navActive(path: string, href: string, others: string[]) {
  if (path === href) return true;
  if (!path.startsWith(`${href}/`)) return false;
  return !others.some((other) => other !== href && other.length > href.length && (path === other || path.startsWith(`${other}/`)));
}

export function BottomNav({ items = PRIMARY_NAV }: { items?: readonly { href: string; label: string }[] }) {
  const path = usePathname();
  const hrefs = items.map((item) => item.href);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[#fffdf8] pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className={clsx("mx-auto grid max-w-md px-1 pt-1", items.length <= 2 ? "grid-cols-2" : "grid-cols-5")}>
        {items.map((item) => {
          const active = navActive(path, item.href, hrefs);
          const Icon = ICONS[item.href] ?? Menu;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                className={clsx(
                  "flex h-14 min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold",
                  active ? "text-burgundy" : "text-[#8a7a72]",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({
  extras,
  items = PRIMARY_NAV,
}: {
  extras: { href: string; label: string }[];
  items?: readonly { href: string; label: string }[];
}) {
  const path = usePathname();
  const primary = items.filter((item) => item.href !== "/more");
  const extraHrefs = extras.map((item) => item.href);
  const primaryHrefs = primary.map((item) => item.href);
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
      {primary.map((item) => {
        const active = navActive(path, item.href, primaryHrefs);
        const Icon = ICONS[item.href] ?? Menu;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
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
      {extras.length ? (
        <>
          <p className="mt-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#8a7a72]">Điều hành</p>
          {extras.map((item) => {
            const active = navActive(path, item.href, extraHrefs);
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
        </>
      ) : null}
    </nav>
  );
}
