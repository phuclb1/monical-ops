import { SHIFT_TYPES, type ShiftType } from "./types";

export const DEFAULT_WEEK_DUTY: Record<ShiftType, string> = {
  morning: "u-quanly",
  afternoon: "u-quanly",
  night: "u-quanly",
};

export function weekSlotId(weekday: number, shiftType: ShiftType, effectiveFrom = "1970-01-01") {
  return `rw-${effectiveFrom}-${weekday}-${shiftType}`;
}

export function rosterVersionOf<T extends { effectiveFrom?: string | null }>(rows: T[], date: string) {
  const applicable = rows.filter((row) => (row.effectiveFrom || "1970-01-01") <= date);
  const latest = applicable.reduce((max, row) => {
    const from = row.effectiveFrom || "1970-01-01";
    return from > max ? from : max;
  }, "");
  return {
    effectiveFrom: latest || null,
    slots: latest ? applicable.filter((row) => (row.effectiveFrom || "1970-01-01") === latest) : [],
  };
}

export function dayOverrideId(date: string, shiftType: ShiftType) {
  return `rd-${date}-${shiftType}`;
}

export const ROSTER_SHIFTS = SHIFT_TYPES;
