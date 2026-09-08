import { can } from "./permissions";
import type { Role } from "./types";

export const PRIMARY_NAV = [
  { href: "/today", label: "Hôm nay" },
  { href: "/tasks", label: "Công việc" },
  { href: "/rooms", label: "Phòng" },
  { href: "/handover", label: "Bàn giao" },
  { href: "/more", label: "Thêm" },
] as const;

export function extraNav(role: Role) {
  return [
    { href: "/reception", label: "Lễ tân", show: can(role, "viewReception") || role === "hk" },
    { href: "/kitchen", label: "Bếp", show: can(role, "viewKitchen") },
    { href: "/shifts", label: "Ca làm việc", show: true },
    { href: "/forms", label: "Biểu mẫu", show: true },
    { href: "/incidents", label: "Sự cố", show: true },
    { href: "/reports", label: "Báo cáo", show: can(role, "viewReports") },
    { href: "/staff", label: "Nhân viên", show: can(role, "manageStaff") },
    { href: "/roster", label: "Lịch lễ tân", show: can(role, "manageRoster") },
    { href: "/rooms/manage", label: "Hạng phòng", show: can(role, "manageRooms") },
    { href: "/notifications", label: "Thông báo", show: true },
  ].filter((item) => item.show);
}
