import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { can } from "../../permissions";
import { PAYMENT_METHOD_LABEL } from "../../constants";
import { addRefundSplit, canSettleOtaDebt, collectedSplit, depositMethodOf, depositRefundSplit, formatVnd, guestCheckoutDue, isActiveSaleStatus, parsePaymentMethod, parseStayRefundReason, refundSplitFromMethod, refundTotal, salePaid, stayRefundable, STAY_REFUND_REASON_LABEL } from "../../sales";
import type { SaleStatus, SessionUser } from "../../types";
import { audit } from "../audit";
import { bookingCheckinPaidReady } from "../../zalo-templates";
import { dispatchCheckinPaidZalo } from "../../zalo-notify";
import { bookingCreatedBy, notifyBookingChange } from "./notify";
import { syncBookingMoney } from "./money-sync";
import { getBooking } from "./queries";
import { applySaleRoomState } from "./stay";
import { insertBookingTransaction } from "./transactions";

export async function recordBookingPayment(
  user: SessionUser,
  bookingId: string,
  data: { amount?: number; settle?: boolean; paymentMethod?: string; paidAt?: string; note?: string; photo?: string },
) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const active = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng, không thu thêm");
  const due = Math.max(0, Math.round(booking.due || 0));
  if (due <= 0) throw new Error("Booking đã thu đủ");
  const amount = Math.max(0, Math.round(data.amount || 0));
  const added = data.settle || !amount ? due : Math.min(amount, due);
  const method = parsePaymentMethod(data.paymentMethod);
  const tx = await insertBookingTransaction(user, booking.id, {
    kind: "payment",
    amount: added,
    method,
    paidAt: data.paidAt,
    note: data.note,
    photo: data.photo,
  });
  await audit(user.id, "booking_tx", tx.id, "create", null, { bookingId: booking.id, kind: "payment", amount: added, method });
  await syncBookingMoney(booking.id);
  await dispatchCheckinPaidZalo(user.id, booking.id, bookingCheckinPaidReady(booking)).catch((error) => console.error("zalo booking", error));
  return booking.id;
}

export async function settleOtaDebt(
  user: SessionUser,
  bookingId: string,
  data: { paidAt?: string; note?: string; photo?: string } = {},
) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  if (!canSettleOtaDebt(booking)) throw new Error("Chỉ ghi nhận OTA sau khi mọi phòng đã checkout và còn công nợ");
  const amount = Math.max(0, Math.round(booking.due || 0));
  const tx = await insertBookingTransaction(user, booking.id, {
    kind: "ota",
    amount,
    method: "company",
    paidAt: data.paidAt,
    note: data.note || "Đã nhận tiền OTA",
    photo: data.photo,
  });
  await audit(user.id, "booking_tx", tx.id, "create", null, { bookingId: booking.id, kind: "ota", amount, method: "company" });
  await syncBookingMoney(booking.id);
  return booking.id;
}

export async function recordBookingRefund(
  user: SessionUser,
  bookingId: string,
  data: { amount?: number; paymentMethod?: string; reason?: string; paidAt?: string; note?: string; photo?: string },
) {
  if (!can(user.role, "cancelBooking")) throw new Error("Chỉ quản lý mới hoàn tiền");
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const stayed = booking.rooms.some((row) => row.status === "departed" || row.status === "inhouse");
  if (!stayed) throw new Error("Chỉ hoàn tiền khi khách đã nhận hoặc đã trả phòng");
  const collected = salePaid(booking).deposit;
  const already = refundTotal(booking);
  const refundable = stayRefundable(collected, already);
  if (refundable <= 0) throw new Error("Không còn tiền để hoàn");
  const amount = Math.max(0, Math.round(data.amount || 0));
  if (amount <= 0) throw new Error("Nhập số tiền hoàn");
  if (amount > refundable) throw new Error(`Không hoàn quá số đã thu còn lại ${formatVnd(refundable)}`);
  const method = parsePaymentMethod(data.paymentMethod);
  const reason = parseStayRefundReason(data.reason);
  const tx = await insertBookingTransaction(user, booking.id, {
    kind: "refund",
    amount,
    method,
    paidAt: data.paidAt,
    note: data.note || STAY_REFUND_REASON_LABEL[reason],
    photo: data.photo,
  });
  const db = await getDb();
  const now = nowISO();
  const next = addRefundSplit(booking, refundSplitFromMethod(amount, method));
  const patch = {
    refundReason: reason,
    refundedAt: todayVN(),
    updatedAt: now,
    updatedBy: user.id,
  };
  for (const row of booking.rooms) {
    await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, row.id));
    await audit(user.id, "room_sale", row.id, "refund", {
      refundCash: row.refundCash,
      refundTransfer: row.refundTransfer,
      refundCompany: row.refundCompany,
      refundedAt: row.refundedAt,
      refundReason: row.refundReason,
    }, { ...next, ...patch, txId: tx.id });
  }
  await syncBookingMoney(booking.id);
  const createdBy = [...booking.rooms].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdBy;
  await notifyBookingChange({
    actor: user,
    bookingId: booking.id,
    createdBy,
    title: `Hoàn tiền · ${booking.guestName}`,
    body: `${user.fullName} · ${formatVnd(amount)} từ ${PAYMENT_METHOD_LABEL[method]} · ${STAY_REFUND_REASON_LABEL[reason]}`,
  });
  return booking.id;
}

function assertCanCancel(user: SessionUser) {
  if (!can(user.role, "cancelBooking")) throw new Error("Chỉ quản lý mới hủy booking");
}

export async function cancelBooking(user: SessionUser, bookingId: string, asNoShow = false, opts?: { refundDeposit?: boolean }) {
  assertCanCancel(user);
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const active = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng");
  if (asNoShow && active.some((row) => row.status !== "reserved")) {
    throw new Error("No-show chỉ khi mọi phòng còn giữ chỗ");
  }
  if (opts?.refundDeposit) {
    const hold = collectedSplit(salePaid(booking).deposit, booking.checkinPaid).hold;
    if (hold > 0) {
      await insertBookingTransaction(user, booking.id, {
        kind: "refund",
        amount: hold,
        method: depositMethodOf(booking, booking.checkinPaid, booking.checkinMethod),
      });
    }
  }
  for (const row of active) {
    await cancelRoomSale(user, row.id, asNoShow, { silent: true, refundDeposit: Boolean(opts?.refundDeposit), skipMoneySync: true });
  }
  await syncBookingMoney(booking.id);
  const createdBy = [...booking.rooms].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdBy;
  await notifyBookingChange({
    actor: user,
    bookingId: booking.id,
    createdBy,
    title: `${asNoShow ? "No-show" : "Hủy booking"} · ${booking.guestName}`,
    body: `${user.fullName} · ${active.length} phòng · ${booking.roomLabel}`,
  });
  return booking.id;
}

export async function checkinRoomSale(user: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (before.status !== "reserved") throw new Error("Chỉ nhận phòng khi đang giữ chỗ");
  const today = todayVN();
  if (today < before.checkIn) throw new Error("Chưa đến ngày nhận phòng");
  const bookingId = before.bookingId || before.id;
  const prior = await getBooking(bookingId);
  const wasPaidInhouse = prior ? bookingCheckinPaidReady(prior) : false;
  const now = nowISO();
  const patch = { status: "inhouse" as const, checkedInAt: now, updatedAt: now, updatedBy: user.id };
  await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, id));
  await applySaleRoomState(user.id, { roomId: before.roomId, status: "inhouse" });
  await audit(user.id, "room_sale", id, "checkin", before, { status: "inhouse", checkedInAt: now });
  await dispatchCheckinPaidZalo(user.id, bookingId, wasPaidInhouse).catch((error) => console.error("zalo booking", error));
}

function assertCheckoutCollected(booking: Awaited<ReturnType<typeof getBooking>>) {
  if (!booking) throw new Error("Không tìm thấy booking");
  const due = guestCheckoutDue(booking.due, booking.source, booking.otaPaymentMode);
  if (due > 0) throw new Error(`Chưa thu đủ. Còn phải thu ${formatVnd(due)}`);
}

export async function checkoutRoomSale(user: SessionUser, id: string, opts?: { skipMoneySync?: boolean }) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (before.status !== "inhouse") throw new Error("Chỉ trả phòng khi khách đang ở");
  await assertCheckoutCollected(await getBooking(before.bookingId || before.id));
  const today = todayVN();
  const checkOut = today < before.checkOut ? today : before.checkOut;
  if (checkOut < before.checkIn) throw new Error("Ngày trả không hợp lệ");
  const now = nowISO();
  await db
    .update(t.roomSales)
    .set({ status: "departed", checkOut, checkedOutAt: now, updatedAt: now, updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await applySaleRoomState(user.id, { roomId: before.roomId, status: "departed" });
  await audit(user.id, "room_sale", id, "checkout", before, { status: "departed", checkOut, checkedOutAt: now });
  if (!opts?.skipMoneySync) await syncBookingMoney(before.bookingId || before.id);
}

export async function checkinBooking(user: SessionUser, bookingId: string) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const ready = booking.rooms.filter((row) => row.status === "reserved" && todayVN() >= row.checkIn);
  if (!ready.length) throw new Error("Chưa đến ngày nhận, hoặc không còn phòng giữ chỗ");
  for (const row of ready) await checkinRoomSale(user, row.id);
  return booking.id;
}

export async function checkoutBooking(user: SessionUser, bookingId: string) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const staying = booking.rooms.filter((row) => row.status === "inhouse");
  if (!staying.length) throw new Error("Không có phòng đang ở");
  assertCheckoutCollected(booking);
  for (const row of staying) await checkoutRoomSale(user, row.id, { skipMoneySync: true });
  await syncBookingMoney(booking.id);
  return booking.id;
}

export async function cancelRoomSale(user: SessionUser, id: string, asNoShow = false, opts?: { silent?: boolean; refundDeposit?: boolean; skipMoneySync?: boolean }) {
  assertCanCancel(user);
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng");
  if (asNoShow && before.status !== "reserved") throw new Error("No-show chỉ áp dụng chỗ đang giữ");
  const status: SaleStatus = asNoShow ? "no_show" : "cancelled";
  const refund = !asNoShow && opts?.refundDeposit
    ? { ...depositRefundSplit(before), refundedAt: todayVN() }
    : {};
  if (!asNoShow && opts?.refundDeposit && !opts.skipMoneySync) {
    const hold = collectedSplit(salePaid(before).deposit, before.checkinPaid).hold;
    if (hold > 0) {
      await insertBookingTransaction(user, before.bookingId || before.id, {
        kind: "refund",
        amount: hold,
        method: depositMethodOf(before, before.checkinPaid, before.checkinMethod),
      });
    }
  }
  await db
    .update(t.roomSales)
    .set({ status, ...refund, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await audit(user.id, "room_sale", id, asNoShow ? "no_show" : "cancel", before, { status, ...refund });
  if (!opts?.skipMoneySync) await syncBookingMoney(before.bookingId || before.id);
  if (opts?.silent) return;
  const bookingId = before.bookingId || before.id;
  await notifyBookingChange({
    actor: user,
    bookingId,
    createdBy: await bookingCreatedBy(bookingId, before.createdBy),
    title: `${asNoShow ? "No-show" : "Hủy phòng"} · ${before.guestName}`,
    body: `${user.fullName}`,
  });
}
