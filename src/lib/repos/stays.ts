import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { addMinutes, nid, nowISO } from "../datetime";
import { ensureTodayRoomTasks, loadChecklistsForRoom, loadChecklistsForStay } from "../checklist-ops";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export async function listStays() {
  const db = await getDb();
  const stays = await db.select().from(t.stays);
  const rooms = await db.select().from(t.rooms);
  const vehicles = await db.select().from(t.vehicles);
  const requests = await db.select().from(t.guestRequests);
  const tasks = await db.select().from(t.tasks);
  return stays.map((s) => ({
    ...s,
    room: rooms.find((r) => r.id === s.roomId) ?? null,
    vehicles: vehicles.filter((v) => v.stayId === s.id),
    requests: requests.filter((r) => r.stayId === s.id),
    tasks: tasks.filter((task) => task.stayId === s.id),
  }));
}

export async function getStay(id: string) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  const all = await listStays();
  const stay = all.find((s) => s.id === id) ?? null;
  if (!stay) return null;
  const byStay = await loadChecklistsForStay(db, id);
  const byRoom = stay.roomId ? await loadChecklistsForRoom(db, stay.roomId) : [];
  const seen = new Set<string>();
  const checklists = [...byStay, ...byRoom].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return { ...stay, checklists };
}

export async function getRoomDayChecklists(roomId: string) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  return loadChecklistsForRoom(db, roomId);
}

export async function updateStay(user: SessionUser, id: string, patch: Record<string, unknown>) {
  const db = await getDb();
  const before = (await db.select().from(t.stays).where(eq(t.stays.id, id)))[0];
  if (!before) throw new Error("Không tìm thấy booking tham chiếu");
  const next = { ...patch, updatedAt: nowISO(), updatedBy: user.id } as Record<string, unknown>;
  if (patch.pmsCheckinOk && !before.pmsCheckinOk && !before.registrationDueAt) {
    const start = nowISO();
    next.checkinAt = before.checkinAt || start;
    next.registrationDueAt = addMinutes(String(next.checkinAt), 30);
    if (before.status === "arriving" || before.status === "no_show") next.status = "inhouse";
  }
  await db.update(t.stays).set(next as typeof t.stays.$inferInsert).where(eq(t.stays.id, id));
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "stay", id, "update", before, next);
}

export async function addVehicle(user: SessionUser, stayId: string, data: { vehicleType: string; plate: string; location?: string; keyLocation?: string }) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.vehicles).values({
    id,
    stayId,
    vehicleType: data.vehicleType,
    plate: data.plate,
    location: data.location || null,
    keyLocation: data.keyLocation || null,
    notes: null,
    createdAt: nowISO(),
  });
  await audit(user.id, "vehicle", id, "create", null, data);
}

export async function addGuestRequest(user: SessionUser, data: {
  stayId?: string;
  roomId?: string;
  kind: string;
  content: string;
  quantity: number;
  dueAt?: string;
  assigneeId?: string;
}) {
  const db = await getDb();
  const id = nid();
  await db.insert(t.guestRequests).values({
    id,
    stayId: data.stayId || null,
    roomId: data.roomId || null,
    kind: data.kind,
    content: data.content,
    quantity: data.quantity,
    dueAt: data.dueAt || null,
    assigneeId: data.assigneeId || null,
    status: "open",
    createdBy: user.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  await audit(user.id, "guest_request", id, "create", null, data);
  return id;
}

export async function completeRequest(user: SessionUser, id: string) {
  const db = await getDb();
  await db.update(t.guestRequests).set({ status: "done", updatedAt: nowISO() }).where(eq(t.guestRequests.id, id));
  await audit(user.id, "guest_request", id, "done");
}
