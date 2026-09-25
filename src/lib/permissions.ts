import type { Role } from "./types";

const OPS: Role[] = ["reception", "hk", "kitchen", "utility", "manager"];

export const CAN = {
  viewToday: OPS,
  viewTasks: OPS,
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
  viewHandover: OPS,
  acceptHandover: OPS,
  closeShift: OPS,
  viewReports: ["manager", "reception"] as Role[],
  viewSalesRevenue: ["manager"] as Role[],
  viewOwner: ["owner"] as Role[],
  viewAccounting: ["accounting"] as Role[],
  viewRoomChart: ["accounting"] as Role[],
  viewPayments: ["accounting", "manager", "reception"] as Role[],
  viewGuestPii: ["reception", "hk", "manager", "owner"] as Role[],
  manageProcess: ["manager"] as Role[],
  manageStaff: ["manager"] as Role[],
  viewAudit: ["manager"] as Role[],
  manageRooms: ["manager"] as Role[],
  manageSales: ["reception", "manager"] as Role[],
  cancelBooking: ["manager"] as Role[],
  manageRates: ["manager"] as Role[],
  manageRoster: ["manager"] as Role[],
  approveIncident: ["manager"] as Role[],
};

export function can(role: Role, action: keyof typeof CAN) {
  return CAN[action].includes(role);
}
