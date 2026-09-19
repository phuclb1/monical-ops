import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { nid, nowISO } from "../datetime";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export async function listIncidents() {
  const db = await getDb();
  return db.select().from(t.incidents).orderBy(desc(t.incidents.createdAt));
}

export async function createIncident(user: SessionUser, data: {
  type: string;
  location?: string;
  roomId?: string;
  description: string;
  severity: string;
  photo?: string;
}) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.incidents).values({
    id,
    type: data.type,
    location: data.location || null,
    roomId: data.roomId || null,
    description: data.description,
    severity: data.severity,
    status: "pending",
    photo: data.photo || null,
    reportedBy: user.id,
    approvedBy: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  await notify({ role: "manager", title: "Sự cố mới", body: data.description, link: "/incidents" });
  await audit(user.id, "incident", id, "create", null, data);
  return id;
}

export async function approveIncident(user: SessionUser, id: string) {
  const db = await getDb();
  await db.update(t.incidents).set({ status: "approved", approvedBy: user.id, updatedAt: nowISO() }).where(eq(t.incidents.id, id));
}
