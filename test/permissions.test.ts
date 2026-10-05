import assert from "node:assert/strict";
import { test } from "node:test";
import { can } from "../src/lib/permissions";

test("chỉ quản lý nhập được chi phí", () => {
  assert.equal(can("manager", "manageExpenses"), true);
  assert.equal(can("reception", "manageExpenses"), false);
  assert.equal(can("accounting", "manageExpenses"), false);
  assert.equal(can("owner", "manageExpenses"), false);
  assert.equal(can("kitchen", "manageExpenses"), false);
});

test("chỉ quản lý được hủy booking", () => {
  assert.equal(can("manager", "cancelBooking"), true);
  assert.equal(can("reception", "cancelBooking"), false);
  assert.equal(can("hk", "cancelBooking"), false);
  assert.equal(can("accounting", "cancelBooking"), false);
  assert.equal(can("reception", "manageSales"), true);
});

test("lễ tân được vận hành booking nhưng không được xem doanh thu tổng hợp", () => {
  assert.equal(can("reception", "manageSales"), true);
  assert.equal(can("reception", "viewSalesRevenue"), false);
  assert.equal(can("manager", "viewSalesRevenue"), true);
});

test("kế toán chỉ có quyền vào view kế toán, sơ đồ phòng, đặt phòng và xem thanh toán", () => {
  assert.equal(can("accounting", "viewAccounting"), true);
  assert.equal(can("accounting", "viewRoomChart"), true);
  assert.equal(can("accounting", "viewBookings"), true);
  assert.equal(can("reception", "viewBookings"), false);
  assert.equal(can("accounting", "manageSales"), false);
  assert.equal(can("accounting", "viewPayments"), true);
  assert.equal(can("accounting", "viewToday"), false);
  assert.equal(can("accounting", "viewTasks"), false);
  assert.equal(can("accounting", "viewHandover"), false);
  assert.equal(can("accounting", "viewReports"), false);
  assert.equal(can("accounting", "viewSalesRevenue"), false);
  assert.equal(can("accounting", "viewGuestPii"), false);
});
