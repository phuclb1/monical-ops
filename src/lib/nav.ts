import { can } from "./permissions";
import type { Role } from "./types";

export const PRIMARY_NAV = [
  { href: "/today", label: "Hôm nay" },
  { href: "/tasks", label: "Việc" },
  { href: "/rooms", label: "Phòng" },
  { href: "/handover", label: "Bàn giao" },
  { href: "/more", label: "Thêm" },
] as const;

export const DESKTOP_NAV = [
  { href: "/", label: "Dashboard" },
  ...PRIMARY_NAV,
] as const;

export const MANAGER_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/sales/bookings", label: "Đặt phòng" },
  { href: "/reports", label: "Báo cáo" },
  { href: "/tasks", label: "Việc" },
  { href: "/more", label: "Thêm" },
] as const;

export const OWNER_NAV = [
  { href: "/owner", label: "Doanh thu" },
  { href: "/owner/guests", label: "Khách" },
  { href: "/account/password", label: "Mật khẩu" },
] as const;

export const ACCOUNTING_NAV = [
  { href: "/accounting", label: "Kế toán" },
  { href: "/sales", label: "Sơ đồ phòng" },
  { href: "/account/password", label: "Mật khẩu" },
] as const;

export type NavLink = { href: string; label: string; match?: readonly string[] };

export type NavBlock =
  | { kind: "links"; items: NavLink[] }
  | { kind: "group"; label: string; items: NavLink[] };

export type SidebarModel = {
  blocks: NavBlock[];
  footer: NavLink[];
};

export function homePath(role: Role) {
  if (role === "owner") return "/owner";
  if (role === "accounting") return "/accounting";
  if (role === "manager") return "/";
  return "/today";
}

export function isOwnerPath(pathname: string) {
  return pathname === "/owner" || pathname.startsWith("/owner/");
}

export function isAccountingPath(pathname: string) {
  return pathname === "/accounting" || pathname.startsWith("/accounting/");
}

export function isAccountingAllowedPath(pathname: string) {
  return isAccountingPath(pathname) || pathname.startsWith("/account/") || pathname === "/sales";
}

export function flatSidebar(items: readonly { href: string; label: string }[]): SidebarModel {
  return { blocks: [{ kind: "links", items: items.map((item) => ({ href: item.href, label: item.label })) }], footer: [] };
}

export function sidebarNav(role: Role): SidebarModel {
  const salesRooms: NavLink[] = [
    ...(can(role, "manageSales")
      ? [
          { href: "/sales", label: "Sơ đồ phòng" },
          { href: "/sales/bookings", label: "Đặt phòng" },
        ]
      : []),
    ...(can(role, "manageRooms") ? [{ href: "/rooms/manage", label: "Hạng phòng" }] : []),
  ];
  const roomGrouped = salesRooms.length > 0;
  const primary = DESKTOP_NAV.filter((item) => item.href !== "/more");
  const roomAt = primary.findIndex((item) => item.href === "/rooms");
  const blocks: NavBlock[] = [];

  if (roomGrouped && roomAt >= 0) {
    const before = primary.slice(0, roomAt).map((item) => ({ href: item.href, label: item.label }));
    const after = primary.slice(roomAt + 1).map((item) => ({ href: item.href, label: item.label }));
    if (before.length) blocks.push({ kind: "links", items: before });
    blocks.push({ kind: "group", label: "Phòng", items: [{ href: "/rooms", label: "Vận hành" }, ...salesRooms] });
    if (after.length) blocks.push({ kind: "links", items: after });
  } else {
    blocks.push({ kind: "links", items: primary.map((item) => ({ href: item.href, label: item.label })) });
  }

  if (can(role, "viewReports")) {
    blocks.push({ kind: "group", label: "Quản lý", items: [{ href: "/reports", label: "Báo cáo" }] });
  }

  const ops = [
    { href: "/reception", label: "Lễ tân", show: can(role, "viewReception") || role === "hk" },
    { href: "/sales/extras", label: "Dịch vụ kèm", show: can(role, "manageRates") },
    { href: "/kitchen", label: "Bếp / ăn sáng", show: can(role, "viewKitchen") },
    { href: "/shifts", label: "Ca làm việc", show: true },
    { href: "/forms", label: "Biểu mẫu", show: true },
    { href: "/incidents", label: "Sự cố", show: true },
    { href: "/audit", label: "Nhật ký", show: can(role, "viewAudit") },
    { href: "/notifications", label: "Thông báo", show: true },
  ]
    .filter((item) => item.show)
    .map(({ href, label }) => ({ href, label }));
  if (ops.length) blocks.push({ kind: "group", label: "Điều hành", items: ops });

  const footer: NavLink[] = [];
  if (can(role, "manageSettings") || can(role, "manageStaff") || can(role, "manageRoster")) {
    footer.push({ href: "/settings", label: "Cài đặt", match: ["/staff", "/roster"] });
  }

  return { blocks, footer };
}
