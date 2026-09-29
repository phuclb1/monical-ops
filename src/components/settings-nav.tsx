import { TabChip } from "@/components/ui";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const ITEMS = [
  { href: "/settings/access", label: "Cấu hình", allow: "manageSettings" },
  { href: "/settings/zalo", label: "Zalo", allow: "manageSettings" },
  { href: "/roster", label: "Lịch lễ tân", allow: "manageRoster" },
  { href: "/staff", label: "Nhân viên", allow: "manageStaff" },
] as const;

export function SettingsNav({ role, current }: { role: Role; current: string }) {
  const items = ITEMS.filter((item) => can(role, item.allow));
  if (items.length < 2) return null;
  return (
    <div className="tab-scroller -mx-3 px-3 pb-1">
      {items.map((item) => (
        <TabChip key={item.href} href={item.href} active={current === item.href || current.startsWith(`${item.href}/`)}>
          {item.label}
        </TabChip>
      ))}
    </div>
  );
}
