"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import * as repo from "@/lib/repos";
import { parseMoney } from "@/lib/sales";
import { assertActionPace } from "@/lib/rate-limit";

function requireManager() {
  return requireSession().then((user) => {
    if (!can(user.role, "manageRooms")) throw new Error("Chỉ quản lý mới sửa phòng");
    return user;
  });
}

function fail(e: unknown): never {
  redirect(`/rooms/manage?error=${encodeURIComponent((e as Error).message)}`);
}

function refresh() {
  revalidatePath("/rooms");
  revalidatePath("/rooms/manage");
  revalidatePath("/sales");
  revalidatePath("/sales/new");
  revalidatePath("/sales/rates");
}

function typeFromForm(formData: FormData) {
  return {
    name: String(formData.get("name") || ""),
    adults: Number(formData.get("adults") || 0),
    baseRate: parseMoney(formData.get("baseRate")),
    weekendRate: parseMoney(formData.get("weekendRate")),
  };
}

export async function createRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-type-create", String(formData.get("name") || ""));
    await repo.createRoomType(user, typeFromForm(formData));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/rooms/manage?ok=type");
}

export async function updateRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-type-update", String(formData.get("id") || ""));
    await repo.updateRoomType(user, String(formData.get("id")), typeFromForm(formData));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/rooms/manage?ok=type");
}

export async function deleteRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-type-delete", String(formData.get("id") || ""));
    await repo.deleteRoomType(user, String(formData.get("id")));
  } catch (e) {
    fail(e);
  }
  refresh();
}

export async function createRoomAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-create", String(formData.get("number") || ""));
    await repo.createManagedRoom(user, String(formData.get("number") || ""), String(formData.get("type") || ""));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/rooms/manage?ok=room");
}

export async function setRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-type-set", String(formData.get("id") || ""));
    await repo.setRoomType(user, String(formData.get("id")), String(formData.get("type") || ""));
  } catch (e) {
    fail(e);
  }
  refresh();
}

export async function deleteRoomAction(formData: FormData) {
  const user = await requireManager();
  try {
    assertActionPace(user.id, "room-delete", String(formData.get("id") || ""));
    await repo.deleteManagedRoom(user, String(formData.get("id")));
  } catch (e) {
    fail(e);
  }
  refresh();
}
