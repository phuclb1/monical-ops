import { SHIFT_TYPES, type ShiftType } from "./types";

export const DEFAULT_WEEK_DUTY: Record<ShiftType, string> = {
  morning: "u-ngan",
  afternoon: "u-thu",
  night: "u-tuyen",
};

export function weekSlotId(weekday: number, shiftType: ShiftType) {
  return `rw-${weekday}-${shiftType}`;
}

export function dayOverrideId(date: string, shiftType: ShiftType) {
  return `rd-${date}-${shiftType}`;
}

export const ROSTER_SHIFTS = SHIFT_TYPES;
