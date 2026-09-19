"use server";

import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

export async function breakfastAction(formData: FormData) {
  const user = await requireSession();
  const date = String(formData.get("date"));
  await repo.upsertBreakfast(user, date, {
    adults: Number(formData.get("adults") || 0),
    children: Number(formData.get("children") || 0),
    vegetarian: Number(formData.get("vegetarian") || 0),
    allergy: Number(formData.get("allergy") || 0),
    early: Number(formData.get("early") || 0),
    takeaway: Number(formData.get("takeaway") || 0),
    notes: String(formData.get("notes") || ""),
    sentBy: user.id,
    actualAdults: formData.get("actualAdults") ? Number(formData.get("actualAdults")) : undefined,
    actualChildren: formData.get("actualChildren") ? Number(formData.get("actualChildren")) : undefined,
  });
  refresh(["/kitchen", "/kitchen/forecast", "/today"]);
}

export async function confirmBreakfastAction(formData: FormData) {
  const user = await requireSession();
  await repo.confirmBreakfast(user, String(formData.get("date")));
  refresh(["/kitchen", "/kitchen/forecast", "/today"]);
}
