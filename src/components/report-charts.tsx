import { HoverSlice, HoverTip, type TipLine } from "@/components/chart-tip";
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
          {items.map((item) => {
            const lines: TipLine[] = [
              { text: item.hint ? `${item.label} · ${item.hint}` : item.label },
              { swatch: "var(--burgundy)", text: `${primaryLabel}: ${formatValue(item.value)}` },
            ];
            if (secondaryLabel) {
              lines.push({ swatch: "#d59a46", text: `${secondaryLabel}: ${formatValue(item.secondary || 0)}` });
            }
            return (
              <HoverTip className="report-bars-column" key={item.label} lines={lines}>
                <div className="report-bars-track">
                  <i
                    className="is-primary"
                    style={{ height: `${Math.max(item.value ? 3 : 1, (item.value / max) * 100)}%` }}
                  />
                  {secondaryLabel ? (
                    <i
                      className="is-secondary"
                      style={{ height: `${Math.max(item.secondary ? 3 : 1, ((item.secondary || 0) / max) * 100)}%` }}
                    />
                  ) : null}
                </div>
                <span>{item.label}</span>
              </HoverTip>
            );
          })}
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
          <HoverTip
            className="report-horizontal-row"
            key={item.label}
            lines={[
              { swatch: CHART_COLORS[index % CHART_COLORS.length], text: item.label },
              { text: formatValue(item.value) },
              ...(item.hint ? [{ text: item.hint }] : []),
            ]}
          >
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
          </HoverTip>
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
  let cursor = 0;
  const slices = items.flatMap((item, index) => {
    if (item.value <= 0 || total <= 0) return [];
    const start = cursor;
    cursor += item.value / total;
    return [{ item, index, start, end: cursor }];
  });

  function lines(item: ReportChartItem, index: number): TipLine[] {
    return [
      { swatch: CHART_COLORS[index % CHART_COLORS.length], text: item.label },
      { text: formatValue(item.value) },
      { text: total ? `${((item.value / total) * 100).toFixed(1)}%` : "0%" },
      ...(item.hint ? [{ text: item.hint }] : []),
    ];
  }

  return (
    <Card className="report-chart-card">
      <div>
        <h2 className="font-bold">{title}</h2>
        {subtitle ? <p className="text-xs text-[#6b7372]">{subtitle}</p> : null}
      </div>
      <div className="report-donut-layout">
        <div className="report-donut" role="img" aria-label={title}>
          <svg className="report-donut-svg" viewBox="0 0 120 120">
            {slices.length ? (
              slices.map((slice) => (
                <HoverSlice
                  key={slice.item.label}
                  d={donutSlice(slice.start, slice.end)}
                  fill={CHART_COLORS[slice.index % CHART_COLORS.length]}
                  lines={lines(slice.item, slice.index)}
                />
              ))
            ) : (
              <circle cx="60" cy="60" r="46" fill="#eee5da" />
            )}
          </svg>
          <div>
            <strong>{formatValue(total)}</strong>
            <span>{centerLabel}</span>
          </div>
        </div>
        <div className="report-donut-legend">
          {items.map((item, index) => (
            <HoverTip key={item.label} lines={lines(item, index)}>
              <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span>{item.label}</span>
              <strong>{formatValue(item.value)}</strong>
              <small>{total ? `${((item.value / total) * 100).toFixed(1)}%` : "0%"}</small>
            </HoverTip>
          ))}
        </div>
      </div>
    </Card>
  );
}

function donutSlice(start: number, end: number) {
  const center = 60;
  const outer = 46;
  const inner = 31;
  const sweep = end - start;
  if (sweep >= 0.999) {
    return `M ${center} ${center - outer} A ${outer} ${outer} 0 1 1 ${center} ${center + outer} A ${outer} ${outer} 0 1 1 ${center} ${center - outer} M ${center} ${center - inner} A ${inner} ${inner} 0 1 0 ${center} ${center + inner} A ${inner} ${inner} 0 1 0 ${center} ${center - inner}`;
  }
  const a0 = start * Math.PI * 2 - Math.PI / 2;
  const a1 = end * Math.PI * 2 - Math.PI / 2;
  const large = sweep > 0.5 ? 1 : 0;
  const point = (radius: number, angle: number) => [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
  const [x0, y0] = point(outer, a0);
  const [x1, y1] = point(outer, a1);
  const [x2, y2] = point(inner, a1);
  const [x3, y3] = point(inner, a0);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}
