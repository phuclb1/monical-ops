"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as repo from "@/lib/repos";
import { parseMoney } from "@/lib/sales";
import { fail, refresh, requireRates, requireSales } from "./shared";

export async function saveRoomRatesAction(formData: FormData) {
  const user = await requireRates();
  const ids = formData.getAll("typeId").map(String);
  try {
    await repo.setRoomTypeRates(
      user,
      ids.map((id) => ({
        id,
        baseRate: parseMoney(formData.get(`rate-${id}`)),
        weekendRate: parseMoney(formData.get(`weekend-${id}`)),
      })),
    );
  } catch (e) {
    fail("/rooms/manage", e);
  }
  refresh();
  redirect("/rooms/manage?ok=1");
}

export async function saveExtraRatesAction(formData: FormData) {
  const user = await requireRates();
  const ids = formData.getAll("typeId").map(String);
  try {
    await repo.setSaleExtraTypeRates(
      user,
      ids.map((id) => ({
        id,
        unitPrice: parseMoney(formData.get(`price-${id}`)),
      })),
    );
  } catch (e) {
    fail("/sales/extras", e);
  }
  refresh();
  revalidatePath("/sales/extras");
  redirect("/sales/extras?ok=1");
}

export async function addBookingExtraAction(formData: FormData) {
  const user = await requireSales();
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.addBookingExtra(user, bookingId, {
      typeId: String(formData.get("typeId") || ""),
      name: String(formData.get("name") || ""),
      qty: Number(formData.get("qty") || 1),
      unitPrice: parseMoney(formData.get("unitPrice") || formData.get("amount")),
    });
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}

export async function removeBookingExtraAction(formData: FormData) {
  const user = await requireSales();
  const extraId = String(formData.get("id") || "");
  const bookingId = String(formData.get("bookingId") || "");
  const back = `/sales/bookings/${bookingId}`;
  try {
    await repo.removeBookingExtra(user, extraId);
  } catch (e) {
    fail(back, e);
  }
  refresh();
  revalidatePath(back);
  redirect(back);
}
