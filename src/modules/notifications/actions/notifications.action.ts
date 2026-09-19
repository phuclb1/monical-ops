"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { countUnreadNotifications, listNotifications, markAllNotifRead, markNotifRead } from "../models/notifications";
import { notificationsRoutes } from "../notifications.route";

function refresh() {
  revalidatePath(notificationsRoutes.list);
  revalidatePath("/today");
}

export async function readNotifAction(formData: FormData) {
  const user = await requireSession();
  await markNotifRead(user, String(formData.get("id")));
  refresh();
}

export async function openNotifAction(formData: FormData) {
  const user = await requireSession();
  const id = String(formData.get("id") || "");
  const link = String(formData.get("link") || notificationsRoutes.list);
  if (id) await markNotifRead(user, id);
  refresh();
  if (link.startsWith("/") && !link.startsWith("//")) redirect(link);
}

export async function readAllNotifAction() {
  const user = await requireSession();
  await markAllNotifRead(user);
  refresh();
}

export async function getUnreadCountAction() {
  const user = await requireSession();
  return countUnreadNotifications(user);
}

export async function getNotificationsAction() {
  const user = await requireSession();
  return listNotifications(user);
}
