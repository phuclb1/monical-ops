"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

export async function createHandoverAction(formData: FormData) {
  const user = await requireSession();
  const id = await repo.createHandover(user, String(formData.get("notes") || ""));
  refresh(["/handover", "/today", "/shifts"]);
  redirect(`/handover/${id}`);
}

export async function acceptHandoverAction(formData: FormData) {
  const user = await requireSession();
  await repo.acceptHandover(user, String(formData.get("id")));
  refresh(["/handover", "/today"]);
}
