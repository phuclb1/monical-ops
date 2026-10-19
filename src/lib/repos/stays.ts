import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { addMinutes, nid, nowISO } from "../datetime";
import { ensureTodayRoomTasks, loadChecklistsForRoom, loadChecklistsForStay } from "../checklist-ops";
import type { SessionUser } from "../types";
import { audit } from "./audit";
import { mapInChunks } from "./chunk";
import { listRooms } from "./rooms";

const ACTIVE_STAY_STATUSES = ["arriving", "inhouse", "departing", "no_show"] as const;

function attachStayRelations(
  stays: (typeof t.stays.$inferSelect)[],
  rooms: Awaited<ReturnType<typeof listRooms>>,
  vehicles: (typeof t.vehicles.$inferSelect)[],
  requests: (typeof t.guestRequests.$inferSelect)[],
  tasks: (typeof t.tasks.$inferSelect)[],
) {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const vehiclesByStay = new Map<string, (typeof vehicles)[number][]>();
  const requestsByStay = new Map<string, (typeof requests)[number][]>();
  const tasksByStay = new Map<string, (typeof tasks)[number][]>();
  for (const row of vehicles) {
    const list = vehiclesByStay.get(row.stayId) || [];
    list.push(row);
    vehiclesByStay.set(row.stayId, list);
  }
  for (const row of requests) {
    if (!row.stayId) continue;
    const list = requestsByStay.get(row.stayId) || [];
    list.push(row);
    requestsByStay.set(row.stayId, list);
  }
  for (const row of tasks) {
    if (!row.stayId) continue;
    const list = tasksByStay.get(row.stayId) || [];
    list.push(row);
    tasksByStay.set(row.stayId, list);
  }
  return stays.map((stay) => ({
    ...stay,
    room: (stay.roomId && roomById.get(stay.roomId)) || null,
    vehicles: vehiclesByStay.get(stay.id) || [],
    requests: requestsByStay.get(stay.id) || [],
    tasks: tasksByStay.get(stay.id) || [],
  }));
}

async function loadStayRelations(stayIds: string[]) {
  const db = await getDb();
  const [rooms, vehicles, requests, tasks] = await Promise.all([
    listRooms(),
    mapInChunks(stayIds, (chunk) => db.select().from(t.vehicles).where(inArray(t.vehicles.stayId, chunk))),
    mapInChunks(stayIds, (chunk) => db.select().from(t.guestRequests).where(inArray(t.guestRequests.stayId, chunk))),
    mapInChunks(stayIds, (chunk) => db.select().from(t.tasks).where(inArray(t.tasks.stayId, chunk))),
  ]);
  return { rooms, vehicles, requests, tasks };
}

export async function listStays(opts?: { includeDeparted?: boolean }) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  const stays = opts?.includeDeparted
    ? await db.select().from(t.stays)
    : await db.select().from(t.stays).where(inArray(t.stays.status, [...ACTIVE_STAY_STATUSES]));
  const related = await loadStayRelations(stays.map((stay) => stay.id));
  return attachStayRelations(stays, related.rooms, related.vehicles, related.requests, related.tasks);
}

export async function getStay(id: string) {
  const db = await getDb();
  await ensureTodayRoomTasks(db, { actorId: "system" });
  const stay = (await db.select().from(t.stays).where(eq(t.stays.id, id)).limit(1))[0];
  if (!stay) return null;
  const [related, byStay, byRoom] = await Promise.all([
    loadStayRelations([id]),
    loadChecklistsForStay(db, id),
    stay.roomId ? loadChecklistsForRoom(db, stay.roomId) : Promise.resolve([]),
  ]);
  const [view] = attachStayRelations([stay], related.rooms, related.vehicles, related.requests, related.tasks);
  const seen = new Set<string>();
  const checklists = [...byStay, ...byRoom].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return { ...view, checklists };
}

export async function findStayForSale(sale: {
  roomId: string;
  guestName: string;
  pmsCode?: string | null;
  stayId?: string | null;
}) {
  const db = await getDb();
  if (sale.stayId) {
    const row = (await db.select().from(t.stays).where(eq(t.stays.id, sale.stayId)).limit(1))[0];
    if (row) return row;
  }
  const pms = sale.pmsCode?.trim();
  if (pms) {
    const byCode = await db
      .select()
      .from(t.stays)
      .where(and(eq(t.stays.pmsCode, pms), eq(t.stays.roomId, sale.roomId)))
      .limit(1);
    if (byCode[0]) return byCode[0];
    const loose = (await db.select().from(t.stays).where(eq(t.stays.pmsCode, pms))).find((row) => !row.roomId);
    if (loose) return loose;
  }
  if (sale.guestName) {
    const byGuest = (
      await db
        .select()
        .from(t.stays)
        .where(and(eq(t.stays.roomId, sale.roomId), eq(t.stays.guestName, sale.guestName), ne(t.stays.status, "departed")))
        .limit(1)
    )[0];
    if (byGuest) return byGuest;
  }
  return (
    (
      await db
        .select()
        .from(t.stays)
        .where(and(eq(t.stays.roomId, sale.roomId), inArray(t.stays.status, [...ACTIVE_STAY_STATUSES])))
        .limit(1)
    )[0] ?? null
  );
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
