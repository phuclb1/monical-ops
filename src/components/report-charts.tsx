import type { CSSProperties } from "react";
import { Card } from "@/components/ui";

const CHART_COLORS = ["#5c1a1b", "#d59a46", "#74ad8e", "#8c6bb1", "#4f86a6", "#c46f52"];

export type ReportChartItem = {
  label: string;
  value: number;
  secondary?: number;
  hint?: string;
};

function defaultFormat(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function GroupedBarChart({
  title,
  subtitle,
  items,
  primaryLabel,
  secondaryLabel,
  formatValue = defaultFormat,
}: {
  title: string;
  subtitle?: string;
  items: ReportChartItem[];
  primaryLabel: string;
  secondaryLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...items.flatMap((item) => [item.value, item.secondary || 0]), 1);
  const minWidth = Math.max(440, items.length * 24);

  return (
    <Card className="report-chart-card">
      <div>
        <h2 className="font-bold">{title}</h2>
        {subtitle ? <p className="text-xs text-[#6b7372]">{subtitle}</p> : null}
      </div>
      <div className="report-chart-legend">
        <span><i className="is-primary" />{primaryLabel}</span>
        {secondaryLabel ? <span><i className="is-secondary" />{secondaryLabel}</span> : null}
      </div>
      <div className="report-bars-scroll">
        <div className="report-bars" style={{ minWidth }} role="img" aria-label={title}>
          {items.map((item) => (
            <div className="report-bars-column" key={item.label}>
              <div className="report-bars-track">
                <i
                  className="is-primary"
                  style={{ height: `${Math.max(item.value ? 3 : 1, (item.value / max) * 100)}%` }}
                  title={`${primaryLabel}: ${formatValue(item.value)}`}
                />
                {secondaryLabel ? (
                  <i
                    className="is-secondary"
                    style={{ height: `${Math.max(item.secondary ? 3 : 1, ((item.secondary || 0) / max) * 100)}%` }}
                    title={`${secondaryLabel}: ${formatValue(item.secondary || 0)}`}
                  />
                ) : null}
              </div>
              <span title={item.hint}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function HorizontalBarChart({
  title,
  subtitle,
  items,
  formatValue = defaultFormat,
}: {
  title: string;
  subtitle?: string;
  items: ReportChartItem[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <Card className="report-chart-card">
      <div>
        <h2 className="font-bold">{title}</h2>
        {subtitle ? <p className="text-xs text-[#6b7372]">{subtitle}</p> : null}
      </div>
      <div className="report-horizontal-chart" role="img" aria-label={title}>
        {items.length ? items.map((item, index) => (
          <div className="report-horizontal-row" key={item.label}>
            <div className="report-horizontal-meta">
              <span>{item.label}</span>
              <strong>{formatValue(item.value)}</strong>
            </div>
            <div className="report-horizontal-track">
              <i
                style={{
                  width: `${Math.max(item.value ? 2 : 0, (item.value / max) * 100)}%`,
                  background: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
            </div>
            {item.hint ? <p>{item.hint}</p> : null}
          </div>
        )) : <p className="py-6 text-center text-sm text-[#6b7372]">Chưa có dữ liệu trong kỳ</p>}
      </div>
    </Card>
  );
}

export function DonutChart({
  title,
  subtitle,
  items,
  centerLabel,
  formatValue = defaultFormat,
}: {
  title: string;
  subtitle?: string;
  items: ReportChartItem[];
  centerLabel: string;
  formatValue?: (value: number) => string;
}) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const stops = items
    .map((item, index) => {
      if (item.value <= 0 || total <= 0) return null;
      const start = items.slice(0, index).reduce((sum, previous) => sum + Math.max(0, previous.value), 0) / total * 100;
      const end = start + (item.value / total) * 100;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
    })
    .filter((stop): stop is string => Boolean(stop));
  const style: CSSProperties = {
    background: stops.length ? `conic-gradient(${stops.join(", ")})` : "#eee5da",
  };

  return (
    <Card className="report-chart-card">
      <div>
        <h2 className="font-bold">{title}</h2>
        {subtitle ? <p className="text-xs text-[#6b7372]">{subtitle}</p> : null}
      </div>
      <div className="report-donut-layout">
        <div className="report-donut" style={style} role="img" aria-label={title}>
          <div>
            <strong>{formatValue(total)}</strong>
            <span>{centerLabel}</span>
          </div>
        </div>
        <div className="report-donut-legend">
          {items.map((item, index) => (
            <div key={item.label}>
              <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span>{item.label}</span>
              <strong>{formatValue(item.value)}</strong>
              <small>{total ? `${((item.value / total) * 100).toFixed(1)}%` : "0%"}</small>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
