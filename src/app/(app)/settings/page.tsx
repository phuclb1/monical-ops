import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

const LINKS = [
  {
    href: "/settings/access",
    label: "Cấu hình",
    text: "IP máy lễ tân và lịch sử đăng nhập.",
    show: (role: Parameters<typeof can>[0]) => can(role, "manageSettings"),
  },
  {
    href: "/roster",
    label: "Lịch lễ tân",
    text: "Xếp ca lễ tân, áp dụng đến khi đổi.",
    show: (role: Parameters<typeof can>[0]) => can(role, "manageRoster"),
  },
  {
    href: "/staff",
    label: "Nhân viên",
    text: "Tài khoản, khóa và đặt lại mật khẩu.",
    show: (role: Parameters<typeof can>[0]) => can(role, "manageStaff"),
  },
];

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const links = LINKS.filter((item) => item.show(user.role));
  if (!links.length) redirect("/more");

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Cài đặt</h1>
        <p className="text-xs text-[#5c6665]">Cấu hình quầy, lịch lễ tân và tài khoản nhân viên.</p>
      </div>
      <div className="list-cards">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="card mb-2 block p-4 md:mb-0">
            <p className="font-semibold">{item.label}</p>
            <p className="text-sm text-[#5c6665]">{item.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
