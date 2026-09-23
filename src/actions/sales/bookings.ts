"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as repo from "@/lib/repos";
import { parseDiscountKind, parseDiscountValue, parseMoney, parsePaymentMethod } from "@/lib/sales";
import { actionBack, assertDepositRefunded, fail, refresh, requireCancel, requireSales, saleFromForm } from "./shared";

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
  let created: { id: string; bookingId: string };
  try {
    created = await repo.addRoomsToBooking(user, id, roomIds);
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
  revalidatePath(`/sales/bookings/${created.bookingId}`);
  redirect(`/sales/bookings/${created.bookingId}`);
}

export async function updateSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  try {
    await repo.updateRoomSale(user, id, saleFromForm(formData));
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
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
    if (!asNoShow) assertDepositRefunded(sale?.deposit || 0, formData);
    await repo.cancelRoomSale(user, id, asNoShow);
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
  try {
    await repo.updateBooking(user, bookingId, {
      assignments,
      guestName: String(formData.get("guestName") || ""),
      guestPhone: String(formData.get("guestPhone") || ""),
      source: String(formData.get("source") || ""),
      adults: Number(formData.get("adults") || 1),
      children: Number(formData.get("children") || 0),
      breakfastAdults: Number(formData.get("breakfastAdults") || 0),
      breakfastChildren: Number(formData.get("breakfastChildren") || 0),
      cars: Math.max(0, Number(formData.get("cars") || 0) || 0),
      bikes: Math.max(0, Number(formData.get("bikes") || 0) || 0),
      deposit: parseMoney(formData.get("deposit")),
      paymentMethod: parsePaymentMethod(formData.get("paymentMethod")),
      notes: String(formData.get("notes") || ""),
    });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function moveGanttSaleAction(formData: FormData) {
  const user = await requireSales();
  const back = actionBack(formData, "/sales");
  try {
    await repo.moveGanttSale(user, {
      saleId: String(formData.get("saleId") || ""),
      roomId: String(formData.get("roomId") || ""),
      checkIn: String(formData.get("checkIn") || ""),
      checkOut: String(formData.get("checkOut") || ""),
    });
  } catch (e) {
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
    if (!asNoShow) assertDepositRefunded(booking?.deposit || 0, formData);
    await repo.cancelBooking(user, bookingId, asNoShow);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}
