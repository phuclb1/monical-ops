import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";

const MANAGER_OPS = [
  { href: "/today", label: "Hôm nay — ca / nhận trả" },
  { href: "/rooms", label: "Phòng — HK / OOO" },
  { href: "/handover", label: "Bàn giao ca" },
];

const LINKS = [
  { href: "/reception", label: "Lễ tân — khách & đăng ký lưu trú", show: (r: Parameters<typeof can>[0]) => can(r, "viewReception") || r === "hk" },
  { href: "/sales", label: "Bán phòng — sơ đồ trống / giữ / nhận", show: (r: Parameters<typeof can>[0]) => can(r, "manageSales") },
  { href: "/sales/bookings", label: "Đặt phòng — booking / nhiều phòng", show: (r: Parameters<typeof can>[0]) => can(r, "manageSales") },
  { href: "/sales/extras", label: "Dịch vụ kèm — phụ thu / giặt sấy / đệm", show: (r: Parameters<typeof can>[0]) => can(r, "manageRates") },
  { href: "/reports/sales", label: "Doanh thu bán phòng — tháng / quý / năm", show: (r: Parameters<typeof can>[0]) => can(r, "viewSalesRevenue") },
  { href: "/kitchen", label: "Bếp — báo cáo ăn sáng / dự báo", show: (r: Parameters<typeof can>[0]) => can(r, "viewKitchen") },
  { href: "/shifts", label: "Ca làm việc & checklist", show: () => true },
  { href: "/forms", label: "Biểu mẫu điện tử", show: () => true },
  { href: "/incidents", label: "Sự cố", show: () => true },
  { href: "/reports", label: "Báo cáo việc chưa xong", show: (r: Parameters<typeof can>[0]) => can(r, "viewReports") || true },
  { href: "/audit", label: "Nhật ký thao tác — ai làm gì, thêm / sửa", show: (r: Parameters<typeof can>[0]) => can(r, "viewAudit") },
  { href: "/notifications", label: "Thông báo + push điện thoại", show: () => true },
  { href: "/staff", label: "Nhân viên — tài khoản", show: (r: Parameters<typeof can>[0]) => can(r, "manageStaff") },
  { href: "/roster", label: "Lịch lễ tân — xếp 1 lần đến khi đổi", show: (r: Parameters<typeof can>[0]) => can(r, "manageRoster") },
  { href: "/rooms/manage", label: "Hạng phòng — giá thường / lễ tết / sức chứa", show: (r: Parameters<typeof can>[0]) => can(r, "manageRooms") },
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
      <Link href="/account/password" className="card flex min-h-16 items-center p-4 font-semibold">
        Đổi mật khẩu
      </Link>
      <div className="list-cards">
      {[
        ...(user.role === "manager" ? MANAGER_OPS : []),
        ...LINKS.filter((l) => l.show(user.role)),
      ].map((l) => (
        <Link key={l.href} href={l.href} className="card mb-2 flex min-h-16 items-center p-4 font-semibold md:mb-0">
          {l.label}
        </Link>
      ))}
      </div>
      <Card>
        <p className="text-sm leading-6 text-[#5c6665]">
          MONICAL Ops không gọi ezCloudhotel. Agent crawl PMS rồi POST vào <code className="text-xs">/api/ingest/pms</code>.
          Lễ tân/quản lý bán phòng và đối chiếu mã PMS trên web. Zalo chỉ để thông báo nhanh.
        </p>
      </Card>
      <form action={logoutAction}>
        <button className="w-full rounded-xl border border-line bg-white py-3.5 text-base font-semibold">Đăng xuất</button>
      </form>
    </main>
  );
}
