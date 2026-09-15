import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { extraNav } from "@/lib/nav";
import { BottomNav, SideNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { PushPrompt } from "@/components/push-prompt";
import { listNotifications } from "@/lib/repos";
import { logoutAction } from "@/actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const notifs = await listNotifications(user);
  const unread = notifs.filter((n) => !n.read).length;
  const extras = extraNav(user.role);

  return (
    <div className="md:flex md:min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-line bg-[#fff8ee] md:flex">
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <div className="overflow-hidden rounded-lg bg-burgundy">
            <Logo className="h-12 w-9 object-cover object-[center_8%]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy">MONICAL</p>
            <p className="text-xs text-[#6b5a52]">Ops · laptop</p>
          </div>
        </div>
        <div className="px-4 pt-4">
          <p className="text-sm font-bold">{user.fullName}</p>
          <p className="text-xs text-[#6b5a52]">{ROLE_LABEL[user.role]}</p>
        </div>
        <SideNav extras={extras} />
        <form action={logoutAction} className="border-t border-line p-3">
          <button className="w-full rounded-xl border border-line bg-white py-2.5 text-sm font-semibold">Đăng xuất</button>
        </form>
      </aside>

      <div className="mx-auto min-h-dvh w-full max-w-md pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:max-w-none md:flex-1 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-sand/95 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:px-6 md:pt-2">
          <div className="flex items-center gap-2 md:hidden">
            <div className="overflow-hidden rounded-lg bg-burgundy">
              <Logo className="h-11 w-[34px] object-cover object-[center_8%]" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy">MONICAL</p>
              <p className="text-sm font-semibold">
                {user.fullName} · {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
          <p className="hidden text-sm font-semibold text-[#5c4a46] md:block">Vận hành khách sạn · không thay PMS</p>
          <Link href="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white">
            <Bell size={18} />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 min-w-4 rounded-full bg-[#c23b3b] px-1 text-center text-[10px] font-bold text-white">
                {unread}
              </span>
            ) : null}
          </Link>
        </header>
        <PushPrompt />
        <div className="page-frame">{children}</div>
        <BottomNav />
      </div>
    </div>
  );
}
