import type { Role } from "./types";

export const CAN = {
  viewKitchen: ["kitchen", "reception", "manager"] as Role[],
  editBreakfast: ["reception", "kitchen", "manager"] as Role[],
  confirmBreakfast: ["kitchen", "manager"] as Role[],
  viewReports: ["manager", "reception"] as Role[],
  viewSalesRevenue: ["manager"] as Role[],
  viewLedger: ["manager"] as Role[],
  viewOwner: ["owner"] as Role[],
  viewAccounting: ["accounting"] as Role[],
  viewRoomChart: ["accounting"] as Role[],
  viewBookings: ["accounting"] as Role[],
  viewPayments: ["accounting", "manager", "reception"] as Role[],
  viewGuestPii: ["reception", "hk", "manager", "owner"] as Role[],
  manageStaff: ["manager"] as Role[],
  manageSettings: ["manager"] as Role[],
  viewAudit: ["manager"] as Role[],
  manageRooms: ["manager"] as Role[],
  manageSales: ["reception", "manager"] as Role[],
  approveBookingChange: ["manager"] as Role[],
  cancelBooking: ["manager"] as Role[],
  manageRates: ["manager"] as Role[],
  manageExpenses: ["manager"] as Role[],
};

export function can(role: Role, action: keyof typeof CAN) {
  return CAN[action].includes(role);
}
