import { TabChip } from "@/components/ui";

export type ReportTab = "sales" | "rooms" | "work";

export function ReportTabs({
  active,
  showSales,
  showWork,
}: {
  active: ReportTab;
  showSales: boolean;
  showWork: boolean;
}) {
  return (
    <nav className="tab-scroller -mx-3 px-3 pb-1" aria-label="Loại báo cáo">
      {showSales ? <TabChip href="/reports/sales" active={active === "sales"}>Doanh thu</TabChip> : null}
      {showSales ? <TabChip href="/reports/rooms" active={active === "rooms"}>Hiệu suất phòng</TabChip> : null}
      {showWork ? <TabChip href="/reports/work" active={active === "work"}>Công việc chung</TabChip> : null}
    </nav>
  );
}
