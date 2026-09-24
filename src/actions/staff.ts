"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadUserSession, requireSession, setSessionCookie } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import * as repo from "@/lib/repos";

function requireManager() {
  return requireSession().then((user) => {
    if (!can(user.role, "manageStaff")) throw new Error("Chỉ quản lý mới sửa nhân viên");
    return user;
  });
}

function fail(path: string, e: unknown): never {
  redirect(`${path}?error=${encodeURIComponent((e as Error).message)}`);
}

function refreshStaffSurfaces(id?: string) {
  revalidatePath("/staff");
  if (id) revalidatePath(`/staff/${id}`);
  revalidatePath("/roster");
  revalidatePath("/today");
  revalidatePath("/more");
  revalidatePath("/tasks");
  revalidatePath("/tasks/new");
  revalidatePath("/reception");
}

export async function createStaffAction(formData: FormData) {
  const user = await requireManager();
  try {
    const id = await repo.createStaff(user, {
      username: String(formData.get("username") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      fullName: String(formData.get("fullName") || ""),
      role: String(formData.get("role") || "") as Role,
      phone: String(formData.get("phone") || "") || undefined,
    });
    refreshStaffSurfaces(id);
    redirect(`/staff/${id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    fail("/staff", e);
  }
}

export async function updateStaffAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id"));
  try {
    await repo.updateStaff(user, id, {
      fullName: String(formData.get("fullName") || ""),
      email: String(formData.get("email") || ""),
      role: String(formData.get("role") || "") as Role,
      phone: String(formData.get("phone") || "") || undefined,
    });
    if (id === user.id) {
      const live = await loadUserSession(id);
      if (live) await setSessionCookie(live);
    }
  } catch (e) {
    fail(`/staff/${id}`, e);
  }
  refreshStaffSurfaces(id);
  redirect(`/staff/${id}?ok=1`);
}

export async function toggleStaffAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id"));
  try {
    await repo.setStaffActive(user, id, String(formData.get("active")) === "1");
  } catch (e) {
    fail(`/staff/${id}`, e);
  }
  refreshStaffSurfaces(id);
}

export async function resetStaffPasswordAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id"));
  try {
    await repo.resetStaffPassword(user, id, String(formData.get("password") || ""));
  } catch (e) {
    fail(`/staff/${id}`, e);
  }
  revalidatePath(`/staff/${id}`);
  redirect(`/staff/${id}?ok=pw`);
}
