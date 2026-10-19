import { and, eq, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { buildRoomFocus, isDirtyRoom } from "../room-focus";
import { listRooms } from "./rooms";
import { listActiveRoomSales } from "./sales/queries";

export async function roomFocusBoard(date: string) {
  const db = await getDb();
  const [rooms, sales, stays, hkTasks, hkReqs] = await Promise.all([
    listRooms(),
    listActiveRoomSales(),
    db
      .select({
        id: t.stays.id,
        roomId: t.stays.roomId,
        guestName: t.stays.guestName,
        status: t.stays.status,
        arrivalDate: t.stays.arrivalDate,
        departureDate: t.stays.departureDate,
      })
      .from(t.stays)
      .where(ne(t.stays.status, "departed")),
    db
      .select({ roomId: t.tasks.roomId, stayId: t.tasks.stayId, status: t.tasks.status })
      .from(t.tasks)
      .where(and(eq(t.tasks.kind, "housekeeping"), notInArray(t.tasks.status, ["done", "checked", "archive"]))),
    db
      .select({ roomId: t.guestRequests.roomId, stayId: t.guestRequests.stayId })
      .from(t.guestRequests)
      .where(and(eq(t.guestRequests.status, "open"), eq(t.guestRequests.kind, "housekeeping"))),
  ]);
  const dirtyRoomIds = new Set<string>();
  for (const room of rooms) {
    if (isDirtyRoom(room)) dirtyRoomIds.add(room.id);
  }
  const stayRoom = new Map(stays.map((stay) => [stay.id, stay.roomId]));
  for (const task of hkTasks) {
    if (["done", "checked", "archive"].includes(task.status)) continue;
    if (task.roomId) dirtyRoomIds.add(task.roomId);
    else if (task.stayId) {
      const roomId = stayRoom.get(task.stayId);
      if (roomId) dirtyRoomIds.add(roomId);
    }
  }
  for (const req of hkReqs) {
    if (req.roomId) dirtyRoomIds.add(req.roomId);
    else if (req.stayId) {
      const roomId = stayRoom.get(req.stayId);
      if (roomId) dirtyRoomIds.add(roomId);
    }
  }
  return buildRoomFocus({ date, rooms, sales, stays, dirtyRoomIds });
}
