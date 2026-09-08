import type { Role } from "./types";

const ALL: Role[] = ["reception", "hk", "kitchen", "utility", "manager", "accounting"];

export const CAN = {
  viewToday: ALL,
  viewTasks: ALL,
  createTask: ["reception", "hk", "kitchen", "utility", "manager"] as Role[],
  checkTask: ["manager", "reception"] as Role[],
  viewRooms: ["reception", "hk", "utility", "manager"] as Role[],
  updateHk: ["hk", "manager"] as Role[],
  approveOoo: ["manager"] as Role[],
  viewReception: ["reception", "manager"] as Role[],
  editStay: ["reception", "manager"] as Role[],
  viewKitchen: ["kitchen", "reception", "manager"] as Role[],
  editBreakfast: ["reception", "kitchen", "manager"] as Role[],
  confirmBreakfast: ["kitchen", "manager"] as Role[],
  viewHandover: ALL,
  acceptHandover: ALL,
  closeShift: ALL,
  viewReports: ["manager", "accounting", "reception"] as Role[],
  viewPayments: ["accounting", "manager", "reception"] as Role[],
  viewGuestPii: ["reception", "hk", "manager"] as Role[],
  manageProcess: ["manager"] as Role[],
  manageStaff: ["manager"] as Role[],
  manageRooms: ["manager"] as Role[],
  manageRoster: ["manager"] as Role[],
  approveIncident: ["manager"] as Role[],
};

export function can(role: Role, action: keyof typeof CAN) {
  return CAN[action].includes(role);
}
