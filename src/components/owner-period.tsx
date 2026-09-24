import Link from "next/link";
import { TabChip } from "@/components/ui";
import { formatPeriodLabel, type PeriodGrain } from "@/lib/datetime";
import type { ReportGrain } from "@/lib/sales-report";

const GRAINS: { id: ReportGrain; label: string }[] = [
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "year", label: "Năm" },
];

function hrefFor(basePath: string, grain: ReportGrain, date: string) {
  return `${basePath}?grain=${grain}&date=${date}`;
}

export function OwnerPeriodBar({
  basePath,
  grain,
  window,
}: {
  basePath: "/owner" | "/owner/guests" | "/accounting";
  grain: PeriodGrain;
  window: { from: string; prev: string; next: string };
}) {
  const year = window.from.slice(0, 4);
  const monthChips = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return { date: `${year}-${month}-01`, label: String(i + 1) };
  });

  return (
    <div className="owner-period space-y-2">
      <div className="tab-scroller -mx-3 px-3 pb-1">
        {GRAINS.map((item) => (
          <TabChip key={item.id} href={hrefFor(basePath, item.id, window.from)} active={grain === item.id}>
            {item.label}
          </TabChip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={hrefFor(basePath, grain, window.prev)} className="hit-btn">
          ‹
        </Link>
        <p className="text-center text-base font-bold">{formatPeriodLabel(grain, window.from)}</p>
        <Link href={hrefFor(basePath, grain, window.next)} className="hit-btn">
          ›
        </Link>
      </div>

      {grain === "month" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {monthChips.map((item) => (
            <TabChip key={item.date} href={hrefFor(basePath, "month", item.date)} active={window.from === item.date}>
              {item.label}
            </TabChip>
          ))}
        </div>
      ) : null}
      {grain === "quarter" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {[1, 2, 3, 4].map((q) => {
            const qDate = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
            return (
              <TabChip key={q} href={hrefFor(basePath, "quarter", qDate)} active={window.from === qDate}>
                Quý {q}
              </TabChip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
