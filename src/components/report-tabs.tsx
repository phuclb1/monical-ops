import { TabChip } from "@/components/ui";

export type ReportTab = "sales" | "cash" | "ledger" | "rooms";

export function ReportTabs({
  active,
  showSales,
}: {
  active: ReportTab;
  showSales: boolean;
}) {
  return (
    <nav className="tab-scroller -mx-3 px-3 pb-1" aria-label="Loại báo cáo">
      {showSales ? <TabChip href="/reports/sales" active={active === "sales"}>Doanh thu</TabChip> : null}
      {showSales ? <TabChip href="/reports/cash" active={active === "cash"}>Dòng tiền</TabChip> : null}
      {showSales ? <TabChip href="/reports/ledger" active={active === "ledger"}>Sổ cái</TabChip> : null}
      {showSales ? <TabChip href="/reports/rooms" active={active === "rooms"}>Hiệu suất phòng</TabChip> : null}
    </nav>
  );
}
