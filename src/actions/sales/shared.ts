"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { parseDiscountKind, parseDiscountValue, parseMoney, parsePaymentMethod } from "@/lib/sales";

export async function requireSales() {
  const user = await requireSession();
  if (!can(user.role, "manageSales")) throw new Error("Chỉ lễ tân và quản lý bán phòng");
  return user;
}

export async function requireRates() {
  const user = await requireSession();
  if (!can(user.role, "manageRates")) throw new Error("Chỉ quản lý sửa giá phòng");
  return user;
}

export function fail(path: string, e: unknown): never {
  redirect(`${path}?error=${encodeURIComponent((e as Error).message)}`);
}

export function actionBack(formData: FormData, fallback: string) {
  const back = String(formData.get("back") || "");
  return back.startsWith("/") && !back.startsWith("//") ? back : fallback;
}

export function refresh() {
  revalidatePath("/sales");
  revalidatePath("/sales/bookings", "layout");
  revalidatePath("/sales/rates");
  revalidatePath("/sales/extras");
  revalidatePath("/rooms");
  revalidatePath("/today");
  revalidatePath("/more");
  revalidatePath("/reports");
  revalidatePath("/reports/sales");
  revalidatePath("/notifications");
  revalidatePath("/kitchen");
}

export function saleFromForm(formData: FormData) {
  const roomIds = [...new Set(formData.getAll("roomId").map(String).filter(Boolean))];
  const fallbackRate = parseMoney(formData.get("rate"));
  const rates: Record<string, number> = {};
  const dates: Record<string, { checkIn: string; checkOut: string }> = {};
  const breakfasts: Record<string, boolean> = {};
  const discounts: Record<string, { kind: string; value: number }> = {};
  for (const key of formData.keys()) {
    if (!key.startsWith("rate-")) continue;
    const roomId = key.slice(5);
    if (roomId) rates[roomId] = parseMoney(formData.get(key));
  }
  const fallbackIn = String(formData.get("checkIn") || "");
  const fallbackOut = String(formData.get("checkOut") || "");
  for (const id of roomIds) {
    if (!rates[id]) rates[id] = parseMoney(formData.get(`rate-${id}`)) || fallbackRate;
    dates[id] = {
      checkIn: String(formData.get(`checkIn-${id}`) || fallbackIn),
      checkOut: String(formData.get(`checkOut-${id}`) || fallbackOut),
    };
    breakfasts[id] = formData.getAll(`breakfast-${id}`).length
      ? formData.getAll(`breakfast-${id}`).map(String).includes("1")
      : true;
    discounts[id] = {
      kind: parseDiscountKind(formData.get(`discountKind-${id}`) || formData.get("discountKind")),
      value: parseDiscountValue(
        formData.get(`discountKind-${id}`) || formData.get("discountKind"),
        formData.get(`discountValue-${id}`) ?? formData.get("discountValue"),
      ),
    };
  }
  return {
    roomId: roomIds[0] || "",
    roomIds,
    rates,
    dates,
    breakfasts,
    discounts,
    guestName: String(formData.get("guestName") || ""),
    guestPhone: String(formData.get("guestPhone") || ""),
    source: String(formData.get("source") || "walk_in"),
    checkIn: dates[roomIds[0] || ""]?.checkIn || fallbackIn,
    checkOut: dates[roomIds[0] || ""]?.checkOut || fallbackOut,
    adults: Number(formData.get("adults") || 1),
    children: Number(formData.get("children") || 0),
    breakfastAdults: Number(formData.get("breakfastAdults") || 0),
    breakfastChildren: Number(formData.get("breakfastChildren") || 0),
    cars: Math.max(0, Number(formData.get("cars") || 0) || 0),
    bikes: Math.max(0, Number(formData.get("bikes") || 0) || 0),
    rate: rates[roomIds[0] || ""] || fallbackRate,
    discountKind: parseDiscountKind(formData.get("discountKind")),
    discountValue: parseMoney(formData.get("discountValue")),
    deposit: parseMoney(formData.get("deposit")),
    paymentMethod: parsePaymentMethod(formData.get("paymentMethod")),
    pmsCode: String(formData.get("pmsCode") || ""),
    notes: String(formData.get("notes") || ""),
    checkinNow: String(formData.get("checkinNow") || "") === "1",
    origin: String(formData.get("fromEzcloud") || "") === "1" ? "ezcloud" : "ops",
    bookingId: String(formData.get("bookingId") || ""),
  };
}
