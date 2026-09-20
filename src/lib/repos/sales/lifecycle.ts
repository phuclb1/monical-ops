import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { applyPaidAmount, isActiveSaleStatus, parsePaymentMethod, salePaid } from "../../sales";
import type { SaleStatus, SessionUser } from "../../types";
import { audit } from "../audit";
import { bookingCreatedBy, notifyBookingChange } from "./notify";
import { getBooking } from "./queries";
import { applySaleRoomState, syncStayFromSale } from "./stay";
import { assertSaleHandoff, spawnCheckoutClean } from "../room-handoff";

export async function recordBookingPayment(
  user: SessionUser,
  bookingId: string,
  data: { amount?: number; settle?: boolean; paymentMethod?: string },
) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const active = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng, không thu thêm");
  const current = salePaid(booking);
  const due = Math.max(0, Math.round(booking.due || 0));
  const amount = Math.max(0, Math.round(data.amount || 0));
  let next = current.deposit;
  if (data.settle || !amount) {
    if (due <= 0) throw new Error("Booking đã thu đủ");
    next = current.deposit + due;
  } else {
    next = current.deposit + amount;
  }
  const paid = applyPaidAmount(current, next, parsePaymentMethod(data.paymentMethod));
  const db = await getDb();
  const now = nowISO();
  for (const row of active) {
    const patch = {
      deposit: paid.deposit,
      cashPaid: paid.cashPaid,
      transferPaid: paid.transferPaid,
      companyPaid: paid.companyPaid,
      updatedAt: now,
      updatedBy: user.id,
    };
    await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, row.id));
    await audit(user.id, "room_sale", row.id, "update", { deposit: row.deposit, cashPaid: row.cashPaid, transferPaid: row.transferPaid, companyPaid: row.companyPaid }, patch);
  }
  return booking.id;
}

export async function cancelBooking(user: SessionUser, bookingId: string, asNoShow = false) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const active = booking.rooms.filter((row) => isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng");
  if (asNoShow && active.some((row) => row.status !== "reserved")) {
    throw new Error("No-show chỉ khi mọi phòng còn giữ chỗ");
  }
  for (const row of active) {
    await cancelRoomSale(user, row.id, asNoShow, { silent: true });
  }
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
  await assertSaleHandoff("checkin", before.roomId);
  await db
    .update(t.roomSales)
    .set({ status: "inhouse", updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status: "inhouse" });
  await applySaleRoomState(user.id, { roomId: before.roomId, status: "inhouse" });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "checkin", before, { status: "inhouse" });
}

export async function checkoutRoomSale(user: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (before.status !== "inhouse") throw new Error("Chỉ trả phòng khi khách đang ở");
  const today = todayVN();
  const checkOut = today < before.checkOut ? today : before.checkOut;
  if (checkOut < before.checkIn) throw new Error("Ngày trả không hợp lệ");
  await assertSaleHandoff("checkout", before.roomId);
  await db
    .update(t.roomSales)
    .set({ status: "departed", checkOut, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status: "departed", checkOut });
  await applySaleRoomState(user.id, { roomId: before.roomId, status: "departed" });
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, before.roomId)).limit(1))[0];
  const stays = await db.select().from(t.stays);
  const stay = stays.find((row) => row.pmsCode && before.pmsCode && row.pmsCode === before.pmsCode && row.roomId === before.roomId)
    ?? stays.find((row) => row.roomId === before.roomId && row.guestName === before.guestName);
  await spawnCheckoutClean(user, {
    roomId: before.roomId,
    stayId: stay?.id,
    guestName: before.guestName,
    roomNumber: room?.number || "",
  });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "checkout", before, { status: "departed", checkOut });
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
  for (const row of staying) await checkoutRoomSale(user, row.id);
  return booking.id;
}

export async function cancelRoomSale(user: SessionUser, id: string, asNoShow = false, opts?: { silent?: boolean }) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng");
  if (asNoShow && before.status !== "reserved") throw new Error("No-show chỉ áp dụng chỗ đang giữ");
  const status: SaleStatus = asNoShow ? "no_show" : "cancelled";
  await db
    .update(t.roomSales)
    .set({ status, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, status });
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, asNoShow ? "no_show" : "cancel", before, { status });
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
