"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function BookingSheetFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const fit = fitRef.current;
    if (!frame || !fit) return;

    let alive = true;
    let natural = 0;
    const apply = () => {
      if (!alive) return;
      if (!natural) {
        fit.style.zoom = "1";
        natural = fit.offsetWidth;
      }
      const available = frame.clientWidth;
      if (!natural || !available) return;
      const next = String(Math.min(1, available / natural));
      if (fit.style.zoom !== next) fit.style.zoom = next;
      fit.dataset.fit = "1";
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    void document.fonts?.ready.then(apply);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={frameRef} className="booking-sheet-frame">
      <div ref={fitRef} className="booking-sheet-fit">
        {children}
      </div>
    </div>
  );
}
