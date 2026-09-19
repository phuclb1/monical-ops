import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import type { SessionUser } from "../../types";
import { listUsers } from "../users";

export async function bookingCreatedBy(bookingId: string, fallback?: string | null) {
  const db = await getDb();
  const rows = await db
    .select({ createdBy: t.roomSales.createdBy, createdAt: t.roomSales.createdAt })
    .from(t.roomSales)
    .where(or(eq(t.roomSales.id, bookingId), eq(t.roomSales.bookingId, bookingId)));
  const first = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return first?.createdBy || fallback || null;
}

export async function notifyBookingChange(input: {
  actor: SessionUser;
  bookingId: string;
  createdBy?: string | null;
  title: string;
  body: string;
}) {
  const payload = { title: input.title, body: input.body, link: `/sales/bookings/${input.bookingId}` };
  await notify({ ...payload, role: "manager" });
  if (!input.createdBy) return;
  const creator = (await listUsers()).find((person) => person.id === input.createdBy);
  if (creator?.role !== "reception") return;
  await notify({ ...payload, userId: creator.id });
}
