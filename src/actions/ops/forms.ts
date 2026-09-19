"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import * as repo from "@/lib/repos";
import { refresh } from "./shared";

export async function saveFormAction(formData: FormData) {
  const user = await requireSession();
  const formCode = String(formData.get("formCode"));
  const payload = Object.fromEntries(formData.entries());
  const id = await repo.saveForm(user, {
    formCode,
    payload,
    signature: String(formData.get("signature") || "") || undefined,
    roomId: String(formData.get("roomId") || "") || undefined,
    stayId: String(formData.get("stayId") || "") || undefined,
  });
  refresh(["/forms", "/reports"]);
  redirect(`/forms/${formCode}/${id}`);
}

export async function createIncidentAction(formData: FormData) {
  const user = await requireSession();
  await repo.createIncident(user, {
    type: String(formData.get("type") || "ops"),
    location: String(formData.get("location") || ""),
    roomId: String(formData.get("roomId") || "") || undefined,
    description: String(formData.get("description")),
    severity: String(formData.get("severity") || "medium"),
    photo: String(formData.get("photo") || "") || undefined,
  });
  refresh(["/incidents", "/today"]);
  redirect("/incidents");
}

export async function approveIncidentAction(formData: FormData) {
  const user = await requireSession();
  await repo.approveIncident(user, String(formData.get("id")));
  refresh(["/incidents"]);
}
