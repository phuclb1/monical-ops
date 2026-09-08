"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
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

export async function createStaffAction(formData: FormData) {
  const user = await requireManager();
  try {
    const id = await repo.createStaff(user, {
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      fullName: String(formData.get("fullName") || ""),
      role: String(formData.get("role") || "") as Role,
      phone: String(formData.get("phone") || "") || undefined,
    });
    revalidatePath("/staff");
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
      role: String(formData.get("role") || "") as Role,
      phone: String(formData.get("phone") || "") || undefined,
    });
  } catch (e) {
    fail(`/staff/${id}`, e);
  }
  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
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
  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
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
