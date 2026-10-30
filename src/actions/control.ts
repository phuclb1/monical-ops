"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertActionPace } from "@/lib/rate-limit";
import { resolveControlIssue } from "@/lib/repos";

export async function resolveControlIssueAction(formData: FormData) {
  const user = await requireSession();
  if (!can(user.role, "viewControl")) throw new Error("Chỉ quản lý được xử lý cảnh báo");
  const fingerprint = String(formData.get("fingerprint") || "");
  const note = String(formData.get("note") || "");
  const kind = String(formData.get("kind") || "");
  try {
    assertActionPace(user.id, "control-resolve", fingerprint);
    await resolveControlIssue(fingerprint, note, user.id);
  } catch (error) {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    params.set("error", (error as Error).message);
    redirect(`/control?${params.toString()}`);
  }
  revalidatePath("/control");
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  params.set("resolved", "1");
  redirect(`/control?${params.toString()}`);
}
