import { Car, Motorbike } from "lucide-react";
import clsx from "clsx";
import { parkingLabel } from "@/lib/sales";

export function ParkingIcons({
  cars,
  bikes,
  size = 12,
  className,
}: {
  cars?: number | null;
  bikes?: number | null;
  size?: number;
  className?: string;
}) {
  if (!cars && !bikes) return null;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center gap-0.5", className)}
      title={parkingLabel(cars, bikes)}
      aria-label={parkingLabel(cars, bikes)}
    >
      {cars ? (
        <span className="inline-flex items-center gap-px">
          <Car size={size} strokeWidth={2.4} aria-hidden />
          <span className="text-[9px] font-bold leading-none">{cars}</span>
        </span>
      ) : null}
      {bikes ? (
        <span className="inline-flex items-center gap-px">
          <Motorbike size={size} strokeWidth={2.4} aria-hidden />
          <span className="text-[9px] font-bold leading-none">{bikes}</span>
        </span>
      ) : null}
    </span>
  );
}
