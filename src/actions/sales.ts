"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import * as repo from "@/lib/repos";
import { parseDiscountKind, parseMoney } from "@/lib/sales";

async function requireSales() {
  const user = await requireSession();
  if (!can(user.role, "manageSales")) throw new Error("Chỉ lễ tân và quản lý bán phòng");
  return user;
}

async function requireRates() {
  const user = await requireSession();
  if (!can(user.role, "manageRates")) throw new Error("Chỉ quản lý sửa giá phòng");
  return user;
}

function fail(path: string, e: unknown): never {
  redirect(`${path}?error=${encodeURIComponent((e as Error).message)}`);
}

function refresh() {
  revalidatePath("/sales");
  revalidatePath("/sales/rates");
  revalidatePath("/rooms");
  revalidatePath("/today");
  revalidatePath("/more");
}

function saleFromForm(formData: FormData) {
  return {
    roomId: String(formData.get("roomId") || ""),
    guestName: String(formData.get("guestName") || ""),
    guestPhone: String(formData.get("guestPhone") || ""),
    source: String(formData.get("source") || "walk_in"),
    checkIn: String(formData.get("checkIn") || ""),
    checkOut: String(formData.get("checkOut") || ""),
    adults: Number(formData.get("adults") || 1),
    children: Number(formData.get("children") || 0),
    rate: parseMoney(formData.get("rate")),
    discountKind: parseDiscountKind(formData.get("discountKind")),
    discountValue: parseMoney(formData.get("discountValue")),
    deposit: parseMoney(formData.get("deposit")),
    pmsCode: String(formData.get("pmsCode") || ""),
    notes: String(formData.get("notes") || ""),
    checkinNow: String(formData.get("checkinNow") || "") === "1",
    origin: String(formData.get("fromEzcloud") || "") === "1" ? "ezcloud" : "ops",
  };
}

export async function createSaleAction(formData: FormData) {
  const user = await requireSales();
  const date = String(formData.get("date") || "");
  const roomId = String(formData.get("roomId") || "");
  const back = `/sales/new?date=${encodeURIComponent(date)}&room=${encodeURIComponent(roomId)}`;
  let id: string;
  try {
    id = await repo.createRoomSale(user, saleFromForm(formData));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(back, e);
  }
  refresh();
  redirect(`/sales/${id}`);
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

export async function checkinSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  try {
    await repo.checkinRoomSale(user, id);
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
}

export async function checkoutSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  try {
    await repo.checkoutRoomSale(user, id);
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
}

export async function cancelSaleAction(formData: FormData) {
  const user = await requireSales();
  const id = String(formData.get("id"));
  try {
    await repo.cancelRoomSale(user, id, String(formData.get("asNoShow") || "") === "1");
  } catch (e) {
    fail(`/sales/${id}`, e);
  }
  refresh();
  revalidatePath(`/sales/${id}`);
}

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
    fail("/sales/rates", e);
  }
  refresh();
  redirect("/sales/rates?ok=1");
}
