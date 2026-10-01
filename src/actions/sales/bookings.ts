"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as repo from "@/lib/repos";
import { collectedSplit, isActiveSaleStatus, parseCommissionKind, parseCommissionValue, parseDiscountKind, parseDiscountValue, parseMoney, parsePaymentMethod, salePaid } from "@/lib/sales";
import { actionBack, assertDepositRefund, fail, refresh, requireCancel, requireSales, saleFromForm } from "./shared";

export async function createSaleAction(formData: FormData) {
  const user = await requireSales();
  const date = String(formData.get("date") || "");
  const roomIds = formData.getAll("roomId").map(String).filter(Boolean);
  const back = `/sales/new?date=${encodeURIComponent(date)}&room=${encodeURIComponent(roomIds[0] || "")}`;
  let created: { id: string; bookingId: string };
  try {
    created = await repo.createRoomSale(user, saleFromForm(formData));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(back, e);
  }
  refresh();
  redirect(`/sales/bookings/${created.bookingId}`);
}

export async function addRoomsToBookingAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  const roomIds = formData.getAll("roomId").map(String).filter(Boolean);
  let result: { mode: "applied" | "requested"; bookingId: string };
  try {
    result = await repo.submitAddRooms(user, id, roomIds);
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
  revalidatePath(`/sales/bookings/${result.bookingId}`);
  redirect(`/sales/bookings/${result.bookingId}${result.mode === "requested" ? "?approval=requested" : ""}`);
}

export async function updateSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  try {
    if (user.role !== "manager") {
      throw new Error("Lễ tân sửa ngày và tiền tại trang booking để gửi quản lý duyệt");
    }
    await repo.updateRoomSale(user, id, saleFromForm(formData));
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
}

export async function checkinBookingRoomAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const id = String(formData.get("id") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    const sale = await repo.getRoomSale(id);
    if (!sale || sale.bookingKey !== bookingId) throw new Error("Phòng không thuộc booking này");
    await repo.checkinRoomSale(user, id, { skipHandoff: true });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  revalidatePath(`/sales/${id}`);
  redirect(back);
}

export async function checkoutBookingRoomAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const id = String(formData.get("id") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    const sale = await repo.getRoomSale(id);
    if (!sale || sale.bookingKey !== bookingId) throw new Error("Phòng không thuộc booking này");
    await repo.checkoutRoomSale(user, id, { skipHandoff: true });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  revalidatePath(`/sales/${id}`);
  redirect(back);
}

export async function checkinBookingAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.checkinBooking(user, bookingId);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function checkoutBookingAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.checkoutBooking(user, bookingId);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function checkinSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  const back = actionBack(formData, `/sales/${id}`);
  try {
    await repo.checkinRoomSale(user, id);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
  if (back !== `/sales/${id}`) redirect(back);
}

export async function checkoutSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  const back = actionBack(formData, `/sales/${id}`);
  try {
    await repo.checkoutRoomSale(user, id);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
  if (back !== `/sales/${id}`) redirect(back);
}

export async function cancelSaleAction(formData: FormData) {
  const user = await requireCancel();
  const id = String(formData.get("id"));
  const back = actionBack(formData, `/sales/${id}`);
  const asNoShow = String(formData.get("asNoShow") || "") === "1";
  try {
    const sale = await repo.getRoomSale(id);
    const otherActive = Boolean(sale?.peers.some((row) => isActiveSaleStatus(row.status)));
    const hold = !sale || otherActive ? 0 : collectedSplit(salePaid(sale).deposit, sale.checkinPaid).hold;
    const refundDeposit = !asNoShow && assertDepositRefund(hold, sale?.checkIn || "", formData);
    await repo.cancelRoomSale(user, id, asNoShow, { refundDeposit });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
  if (back !== `/sales/${id}`) redirect(back);
}

export async function recordBookingPaymentAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.recordBookingPayment(user, bookingId, {
      amount: parseMoney(formData.get("amount")),
      settle: String(formData.get("settle") || "") === "1",
      paymentMethod: parsePaymentMethod(formData.get("paymentMethod")),
    });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function updateBookingAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  const assignments = formData.getAll("saleId").map((saleId) => ({
    saleId: String(saleId),
    roomId: String(formData.get(`room-${saleId}`) || ""),
    checkIn: String(formData.get(`checkIn-${saleId}`) || ""),
    checkOut: String(formData.get(`checkOut-${saleId}`) || ""),
    breakfast: formData.getAll(`breakfast-${saleId}`).map(String).includes("1"),
    discountKind: parseDiscountKind(formData.get(`discountKind-${saleId}`)),
    discountValue: parseDiscountValue(formData.get(`discountKind-${saleId}`), formData.get(`discountValue-${saleId}`)),
  }));
  let result: { mode: "applied" | "requested"; bookingId: string };
  try {
    result = await repo.submitBookingUpdate(user, bookingId, {
      assignments,
      guestName: String(formData.get("guestName") || ""),
      guestPhone: String(formData.get("guestPhone") || ""),
      source: String(formData.get("source") || ""),
      otaPaymentMode: String(formData.get("otaPaymentMode") || "") === "hotel" ? "hotel" : "debt",
      otaCommissionKind: parseCommissionKind(formData.get("otaCommissionKind")),
      otaCommissionValue: parseCommissionValue(formData.get("otaCommissionKind"), formData.get("otaCommissionValue")),
      invoiceRequested: String(formData.get("invoiceRequested") || "") === "1",
      adults: Number(formData.get("adults") || 1),
      children: Number(formData.get("children") || 0),
      breakfastAdults: Number(formData.get("breakfastAdults") || 0),
      breakfastChildren: Number(formData.get("breakfastChildren") || 0),
      cars: Math.max(0, Number(formData.get("cars") || 0) || 0),
      bikes: Math.max(0, Number(formData.get("bikes") || 0) || 0),
      deposit: parseMoney(formData.get("deposit")),
      checkinPaid: parseMoney(formData.get("checkinPaid")),
      paymentMethod: parsePaymentMethod(formData.get("paymentMethod")),
      checkinPaymentMethod: parsePaymentMethod(formData.get("checkinPaymentMethod")),
      notes: String(formData.get("notes") || ""),
      removedSaleIds: formData.getAll("removeSaleId").map(String).filter(Boolean),
    });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(`${back}${result.mode === "requested" ? "?approval=requested" : ""}`);
}

export async function moveGanttSaleAction(formData: FormData) {
  const user = await requireSales();
  const back = actionBack(formData, "/sales");
  try {
    const result = await repo.submitGanttMove(user, {
      saleId: String(formData.get("saleId") || ""),
      roomId: String(formData.get("roomId") || ""),
      checkIn: String(formData.get("checkIn") || ""),
      checkOut: String(formData.get("checkOut") || ""),
    });
    if (result.mode === "requested") {
      refresh();
      redirect(`/sales/bookings/${result.bookingId}?approval=requested`);
    }
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(back, e);
  }
  refresh();
  redirect(back);
}

export async function cancelBookingAction(formData: FormData) {
  const user = await requireCancel();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  const asNoShow = String(formData.get("asNoShow") || "") === "1";
  try {
    const booking = await repo.getBooking(bookingId);
    const active = booking?.rooms.filter((row) => isActiveSaleStatus(row.status)) || [];
    const checkIn = active.reduce((min, row) => (row.checkIn < min ? row.checkIn : min), active[0]?.checkIn || booking?.checkIn || "");
    const hold = booking ? collectedSplit(salePaid(booking).deposit, booking.checkinPaid).hold : 0;
    const refundDeposit = !asNoShow && assertDepositRefund(hold, checkIn, formData);
    await repo.cancelBooking(user, bookingId, asNoShow, { refundDeposit });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function approveBookingChangeAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.approveBookingChange(user, String(formData.get("requestId") || ""));
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(`${back}?approval=approved`);
}

export async function rejectBookingChangeAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.rejectBookingChange(
      user,
      String(formData.get("requestId") || ""),
      String(formData.get("reviewNote") || ""),
    );
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(`${back}?approval=rejected`);
}
