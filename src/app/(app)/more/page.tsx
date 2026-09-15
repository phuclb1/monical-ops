import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";

const LINKS = [
  { href: "/reception", label: "Lễ tân — khách & đăng ký lưu trú", show: (r: Parameters<typeof can>[0]) => can(r, "viewReception") || r === "hk" },
  { href: "/kitchen", label: "Bếp — ăn sáng", show: (r: Parameters<typeof can>[0]) => can(r, "viewKitchen") },
  { href: "/shifts", label: "Ca làm việc & checklist", show: () => true },
  { href: "/forms", label: "Biểu mẫu điện tử", show: () => true },
  { href: "/incidents", label: "Sự cố", show: () => true },
  { href: "/reports", label: "Báo cáo việc chưa xong", show: (r: Parameters<typeof can>[0]) => can(r, "viewReports") || true },
  { href: "/notifications", label: "Thông báo + push điện thoại", show: () => true },
  { href: "/staff", label: "Nhân viên — tài khoản", show: (r: Parameters<typeof can>[0]) => can(r, "manageStaff") },
  { href: "/roster", label: "Lịch lễ tân — xếp 1 lần đến khi đổi", show: (r: Parameters<typeof can>[0]) => can(r, "manageRoster") },
  { href: "/rooms/manage", label: "Phòng & hạng phòng", show: (r: Parameters<typeof can>[0]) => can(r, "manageRooms") },
];

export default async function MorePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Thêm</h1>
      <Card>
        <p className="font-semibold">{user.fullName}</p>
        <p className="text-sm text-[#5c6665]">{ROLE_LABEL[user.role]}</p>
      </Card>
      <div className="list-cards">
      {LINKS.filter((l) => l.show(user.role)).map((l) => (
        <Link key={l.href} href={l.href} className="card mb-2 block p-4 font-semibold md:mb-0">
          {l.label}
        </Link>
      ))}
      </div>
      <Card>
        <p className="text-sm leading-6 text-[#5c6665]">
          MONICAL Ops không thay ezCloudhotel PMS. Booking, check-in, check-out và tiền phòng đối chiếu bằng mã PMS. Zalo chỉ để
          thông báo nhanh — hồ sơ chính thức lưu trên web.
        </p>
      </Card>
      <form action={logoutAction}>
        <button className="w-full rounded-xl border border-line bg-white py-3 font-semibold">Đăng xuất</button>
      </form>
    </main>
  );
}
