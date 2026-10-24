import { can } from "./permissions";
import type { Role } from "./types";

export const PRIMARY_NAV = [
  { href: "/sales/bookings", label: "Đặt phòng" },
  { href: "/sales", label: "Sơ đồ" },
  { href: "/kitchen", label: "Ăn sáng" },
  { href: "/more", label: "Thêm" },
] as const;

export const MANAGER_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/sales/bookings", label: "Đặt phòng" },
  { href: "/sales", label: "Sơ đồ" },
  { href: "/reports", label: "Báo cáo" },
  { href: "/more", label: "Thêm" },
] as const;

export const KITCHEN_NAV = [
  { href: "/kitchen", label: "Ăn sáng" },
  { href: "/kitchen/forecast", label: "Dự báo" },
  { href: "/account/password", label: "Mật khẩu" },
] as const;

export const OWNER_NAV = [
  { href: "/owner", label: "Doanh thu" },
  { href: "/owner/guests", label: "Khách" },
  { href: "/account/password", label: "Mật khẩu" },
] as const;

export const ACCOUNTING_NAV = [
  { href: "/accounting", label: "Kế toán" },
  { href: "/sales/bookings", label: "Đặt phòng" },
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

const REMOVED_OPS_ROOTS = [
  "/today",
  "/tasks",
  "/handover",
  "/shifts",
  "/forms",
  "/incidents",
  "/roster",
  "/reception",
  "/rooms",
  "/reports/work",
  "/kiem-tra-phong",
] as const;

export function isPausedOpsRole(role: Role) {
  return role === "hk" || role === "utility";
}

export function homePath(role: Role) {
  if (role === "owner") return "/owner";
  if (role === "accounting") return "/accounting";
  if (role === "manager") return "/";
  if (role === "kitchen") return "/kitchen";
  return "/sales/bookings";
}

export function isOwnerPath(pathname: string) {
  return pathname === "/owner" || pathname.startsWith("/owner/");
}

export function isAccountingPath(pathname: string) {
  return pathname === "/accounting" || pathname.startsWith("/accounting/");
}

export function isAccountingBookingPath(pathname: string) {
  return pathname === "/sales/bookings" || /^\/sales\/bookings\/[^/]+$/.test(pathname);
}

export function isAccountingAllowedPath(pathname: string) {
  return isAccountingPath(pathname) || pathname.startsWith("/account/") || pathname === "/sales" || isAccountingBookingPath(pathname);
}

export function isKitchenAllowedPath(pathname: string) {
  return pathname === "/kitchen" || pathname.startsWith("/kitchen/") || pathname.startsWith("/account/");
}

export function isRemovedOpsPath(pathname: string) {
  if (pathname === "/rooms/manage" || pathname.startsWith("/rooms/manage/")) return false;
  return REMOVED_OPS_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function flatSidebar(items: readonly { href: string; label: string }[]): SidebarModel {
  return { blocks: [{ kind: "links", items: items.map((item) => ({ href: item.href, label: item.label })) }], footer: [] };
}

export function sidebarNav(role: Role): SidebarModel {
  const blocks: NavBlock[] = [];
  if (role === "manager") {
    blocks.push({ kind: "links", items: [{ href: "/", label: "Dashboard" }] });
  }

  const rooms: NavLink[] = [
    ...(can(role, "manageSales")
      ? [
          { href: "/sales", label: "Sơ đồ phòng" },
          { href: "/sales/bookings", label: "Đặt phòng" },
        ]
      : []),
    ...(can(role, "manageRooms") ? [{ href: "/rooms/manage", label: "Hạng phòng" }] : []),
  ];
  if (rooms.length) blocks.push({ kind: "group", label: "Phòng", items: rooms });

  const manage = [
    { href: "/reports", label: "Báo cáo", show: can(role, "viewReports") },
    { href: "/reports/ledger", label: "Sổ cái", show: can(role, "viewLedger") },
    { href: "/expenses", label: "Chi phí", show: can(role, "manageExpenses") },
  ]
    .filter((item) => item.show)
    .map(({ href, label }) => ({ href, label }));
  if (manage.length) blocks.push({ kind: "group", label: "Quản lý", items: manage });

  const ops = [
    { href: "/sales/extras", label: "Dịch vụ kèm", show: can(role, "manageRates") },
    { href: "/kitchen", label: "Bếp / ăn sáng", show: can(role, "viewKitchen") },
    { href: "/audit", label: "Nhật ký", show: can(role, "viewAudit") },
    { href: "/notifications", label: "Thông báo", show: role === "manager" || role === "reception" || role === "kitchen" },
  ]
    .filter((item) => item.show)
    .map(({ href, label }) => ({ href, label }));
  if (ops.length) blocks.push({ kind: "group", label: "Điều hành", items: ops });

  const footer: NavLink[] = [];
  if (can(role, "manageSettings") || can(role, "manageStaff")) {
    footer.push({ href: "/settings", label: "Cài đặt", match: ["/staff"] });
  }

  return { blocks, footer };
}
