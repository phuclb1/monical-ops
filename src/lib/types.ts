export const ROLES = [
  "reception",
  "hk",
  "kitchen",
  "utility",
  "manager",
  "accounting",
] as const;

export type Role = (typeof ROLES)[number];

export const DEPARTMENTS = [
  "reception",
  "hk",
  "kitchen",
  "utility",
  "management",
  "accounting",
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number];

export const SHIFT_TYPES = ["morning", "afternoon", "night"] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const TASK_STATUSES = [
  "new",
  "accepted",
  "in_progress",
  "done",
  "checked",
  "blocked",
  "archive",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["normal", "priority", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const HK_STATUSES = [
  "waiting",
  "accepted",
  "cleaning",
  "waiting_inspect",
  "ins",
] as const;
export type HkStatus = (typeof HK_STATUSES)[number];

export const ROOM_OPS = [
  "vacant_clean",
  "vacant_dirty",
  "occupied",
  "cleaning",
  "waiting_inspect",
  "ins",
  "ooo",
] as const;
export type RoomOps = (typeof ROOM_OPS)[number];

export const STAY_STATUSES = [
  "arriving",
  "inhouse",
  "departing",
  "departed",
  "no_show",
] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  departmentId: string;
  departmentCode: DepartmentCode;
};

export type FormCode =
  | "BM-01"
  | "BM-02"
  | "BM-03"
  | "BM-04"
  | "BM-05"
  | "BM-06"
  | "BM-09"
  | "BM-10"
  | "BM-13"
  | "BM-14"
  | "BM-15";
