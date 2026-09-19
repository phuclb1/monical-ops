"use server";

import {
  openNotifAction as openNotif,
  readAllNotifAction as readAllNotif,
  readNotifAction as readNotif,
} from "@/modules/notifications/actions/notifications.action";

export async function readNotifAction(formData: FormData) {
  return readNotif(formData);
}

export async function openNotifAction(formData: FormData) {
  return openNotif(formData);
}

export async function readAllNotifAction() {
  return readAllNotif();
}
