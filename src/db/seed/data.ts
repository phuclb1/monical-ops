import type { ShiftType } from "@/lib/types";

export const DEPT_SEED = [
  { id: "d-reception", code: "reception", name: "Lễ tân" },
  { id: "d-hk", code: "hk", name: "Buồng phòng" },
  { id: "d-kitchen", code: "kitchen", name: "Bếp" },
  { id: "d-utility", code: "utility", name: "Tạp vụ" },
  { id: "d-mgmt", code: "management", name: "Quản lý" },
  { id: "d-acc", code: "accounting", name: "Kế toán" },
  { id: "d-owner", code: "owner", name: "Chủ sở hữu" },
] as const;

export const STAFF_SEED = [
  { id: "u-quanly", username: "quanly", fullName: "Minh Quản lý", role: "manager", departmentId: "d-mgmt", phone: "+84901111007" },
  { id: "u-chusohuu", username: "chusohuu", fullName: "Chủ MONICAL", role: "owner", departmentId: "d-owner", phone: "+84901111000" },
] as const;

export const LOCAL_STAFF = [
  { id: "u-ngan", username: "ngan", fullName: "Ngân Lễ tân ca sáng", role: "reception", departmentId: "d-reception", phone: "+84901111001" },
  { id: "u-thu", username: "thu", fullName: "Thu Lễ tân ca chiều", role: "reception", departmentId: "d-reception", phone: "+84901111002" },
  { id: "u-tuyen", username: "tuyen", fullName: "Tuyến Lễ tân ca tối", role: "reception", departmentId: "d-reception", phone: "+84901111003" },
  { id: "u-uyen", username: "uyen", fullName: "Uyên HK", role: "hk", departmentId: "d-hk", phone: "+84901111004" },
] as const;

export const RETIRED_USERNAMES = ["letan", "hk", "bep", "tapvu", "ketoan"] as const;

export const LOCAL_WEEK_DUTY: Record<ShiftType, string> = {
  morning: "u-ngan",
  afternoon: "u-thu",
  night: "u-tuyen",
};

export function isLocalOpsSeed() {
  return process.env.NODE_ENV !== "production" && process.env.USE_D1 !== "1";
}

export function staffForSeed() {
  return isLocalOpsSeed() ? [...STAFF_SEED, ...LOCAL_STAFF] : [...STAFF_SEED];
}

export function onDutyReceptionist(type: ShiftType) {
  return LOCAL_WEEK_DUTY[type];
}

export const DEMO_ROOM_OPS: Record<string, { ops: string; hk: string; assignedTo?: string }> = {
  "102": { ops: "occupied", hk: "ins" },
  "105": { ops: "vacant_clean", hk: "ins" },
  "202": { ops: "occupied", hk: "ins" },
  "305": { ops: "occupied", hk: "ins" },
};
