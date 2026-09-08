"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import * as repo from "@/lib/repos";

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
}

export async function createRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    await repo.createRoomType(user, String(formData.get("name") || ""));
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail(e);
  }
  refresh();
  redirect("/rooms/manage?ok=type");
}

export async function renameRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    await repo.renameRoomType(user, String(formData.get("id")), String(formData.get("name") || ""));
  } catch (e) {
    fail(e);
  }
  refresh();
}

export async function deleteRoomTypeAction(formData: FormData) {
  const user = await requireManager();
  try {
    await repo.deleteRoomType(user, String(formData.get("id")));
  } catch (e) {
    fail(e);
  }
  refresh();
}

export async function createRoomAction(formData: FormData) {
  const user = await requireManager();
  try {
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
    await repo.setRoomType(user, String(formData.get("id")), String(formData.get("type") || ""));
  } catch (e) {
    fail(e);
  }
  refresh();
}

export async function deleteRoomAction(formData: FormData) {
  const user = await requireManager();
  try {
    await repo.deleteManagedRoom(user, String(formData.get("id")));
  } catch (e) {
    fail(e);
  }
  refresh();
}
