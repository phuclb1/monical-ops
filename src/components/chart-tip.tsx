"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type TipLine = { text: string; swatch?: string };

function ChartTip({ tip }: { tip: { x: number; y: number; lines: TipLine[] } | null }) {
  if (!tip || typeof document === "undefined") return null;
  const left = Math.min(window.innerWidth - 12, Math.max(12, tip.x));
  const above = tip.y > 88;
  return createPortal(
    <div
      className="report-chart-tip"
      style={{ left, top: tip.y, transform: above ? "translate(-50%, calc(-100% - 10px))" : "translate(-50%, 14px)" }}
      role="tooltip"
    >
      {tip.lines.map((line, index) => (
        <p key={`${line.text}-${index}`}>
          {line.swatch ? <i style={{ background: line.swatch }} /> : null}
          {line.text}
        </p>
      ))}
    </div>,
    document.body,
  );
}

function useChartTip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: TipLine[] } | null>(null);
  function show(event: MouseEvent, lines: TipLine[]) {
    setTip({ x: event.clientX, y: event.clientY, lines });
  }
  return { tip, show, hide: () => setTip(null) };
}

export function HoverTip({
  lines,
  className,
  children,
}: {
  lines: TipLine[];
  className?: string;
  children: ReactNode;
}) {
  const { tip, show, hide } = useChartTip();
  return (
    <div
      className={className}
      onMouseEnter={(event) => show(event, lines)}
      onMouseMove={(event) => show(event, lines)}
      onMouseLeave={hide}
    >
      {children}
      <ChartTip tip={tip} />
    </div>
  );
}

export function HoverSlice({
  d,
  fill,
  lines,
}: {
  d: string;
  fill: string;
  lines: TipLine[];
}) {
  const { tip, show, hide } = useChartTip();
  return (
    <>
      <path
        className="report-donut-slice"
        d={d}
        fill={fill}
        fillRule="evenodd"
        onMouseEnter={(event) => show(event, lines)}
        onMouseMove={(event) => show(event, lines)}
        onMouseLeave={hide}
      />
      <ChartTip tip={tip} />
    </>
  );
}
