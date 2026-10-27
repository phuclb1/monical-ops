import { notify } from "@/modules/notifications/models/notifications";
import type { SessionUser } from "../../types";

const BOOKING_NOTIFY_ROLES = ["manager", "reception"] as const;

export async function notifyBookingChange(input: {
  actor: SessionUser;
  bookingId: string;
  title: string;
  body: string;
}) {
  const payload = { title: input.title, body: input.body, link: `/sales/bookings/${input.bookingId}` };
  for (const role of BOOKING_NOTIFY_ROLES) {
    await notify({ ...payload, role });
  }
}
