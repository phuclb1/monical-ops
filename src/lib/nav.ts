import { can } from "./permissions";
import type { Role } from "./types";

export const PRIMARY_NAV = [
  { href: "/today", label: "Hôm nay" },
  { href: "/tasks", label: "Việc" },
  { href: "/rooms", label: "Phòng" },
  { href: "/handover", label: "Bàn giao" },
  { href: "/more", label: "Thêm" },
] as const;

export const OWNER_NAV = [
  { href: "/owner", label: "Doanh thu" },
  { href: "/owner/guests", label: "Khách" },
] as const;

export function homePath(role: Role) {
  return role === "owner" ? "/owner" : "/today";
}

export function isOwnerPath(pathname: string) {
  return pathname === "/owner" || pathname.startsWith("/owner/");
}

export function extraNav(role: Role) {
  if (role === "owner") return [];
  return [
    { href: "/reception", label: "Lễ tân", show: can(role, "viewReception") || role === "hk" },
    { href: "/sales", label: "Sơ đồ phòng", show: can(role, "manageSales") },
    { href: "/sales/bookings", label: "Đặt phòng", show: can(role, "manageSales") },
    { href: "/sales/extras", label: "Dịch vụ kèm", show: can(role, "manageRates") },
    { href: "/reports/sales", label: "Doanh thu phòng", show: can(role, "viewSalesRevenue") },
    { href: "/kitchen", label: "Bếp / ăn sáng", show: can(role, "viewKitchen") },
    { href: "/shifts", label: "Ca làm việc", show: true },
    { href: "/forms", label: "Biểu mẫu", show: true },
    { href: "/incidents", label: "Sự cố", show: true },
    { href: "/reports", label: "Báo cáo", show: can(role, "viewReports") },
    { href: "/audit", label: "Nhật ký", show: can(role, "viewAudit") },
    { href: "/staff", label: "Nhân viên", show: can(role, "manageStaff") },
    { href: "/roster", label: "Lịch lễ tân", show: can(role, "manageRoster") },
    { href: "/rooms/manage", label: "Hạng / giá", show: can(role, "manageRooms") },
    { href: "/notifications", label: "Thông báo", show: true },
  ].filter((item) => item.show);
}
