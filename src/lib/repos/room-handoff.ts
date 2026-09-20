import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { spawnRoomChecklist } from "../checklist-ops";
import { notify } from "@/modules/notifications/models/notifications";
import { isActiveSaleStatus } from "../sales";
import { stayForSale } from "../checklist-ops/room-jobs";
import {
  canCheckinAfterStandby,
  canCheckoutAfterInspect,
  doneHandoff,
  handoffBlockReason,
  handoffSpec,
  openHandoff,
  receptionKindAfterInspect,
  type HandoffPurpose,
} from "../room-handoff";
import { isOpenTaskStatus } from "../task-types";
import type { SessionUser } from "../types";
import { createTask } from "./tasks";
import { updateRoom } from "./rooms";

const HANDOFF_KINDS = new Set(["inspect", "housekeeping", "checkout_clean", "checkin", "checkout"]);

export async function listRoomHandoff(roomId: string) {
  const db = await getDb();
  const [rows, sales] = await Promise.all([
    db.select().from(t.tasks).where(eq(t.tasks.roomId, roomId)),
    db.select().from(t.roomSales).where(eq(t.roomSales.roomId, roomId)),
  ]);
  const sale = sales.find((row) => isActiveSaleStatus(row.status));
  return rows.filter((task) => {
    if (!HANDOFF_KINDS.has(task.kind) || task.status === "archive") return false;
    if (sale?.createdAt && task.createdAt < sale.createdAt) return false;
    return true;
  });
}

export async function activeSaleForRoom(roomId: string) {
  const db = await getDb();
  const rows = await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, roomId));
  return rows.find((row) => isActiveSaleStatus(row.status)) ?? null;
}

export async function requestHkHandoff(
  user: SessionUser,
  data: { purpose: HandoffPurpose; roomId: string; stayId?: string; saleId?: string },
) {
  if (user.role !== "reception" && user.role !== "manager") {
    throw new Error("Chỉ lễ tân / quản lý gửi việc này cho HK");
  }
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, data.roomId)).limit(1))[0];
  if (!room) throw new Error("Không tìm thấy phòng");
  const sale = data.saleId
    ? (await db.select().from(t.roomSales).where(eq(t.roomSales.id, data.saleId)).limit(1))[0]
    : (
        await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, data.roomId))
      ).find((row) => isActiveSaleStatus(row.status));
  const guestName = sale?.guestName || "khách";
  if (data.purpose === "standby" && sale && sale.status !== "reserved") {
    throw new Error("Chỉ gửi HK standby khi phòng còn giữ chỗ");
  }
  if (data.purpose === "stayover" && sale && sale.status !== "inhouse") {
    throw new Error("Chỉ gửi HK dọn phòng khi khách đang ở");
  }
  if (data.purpose === "checkout_inspect" && sale && sale.status !== "inhouse") {
    throw new Error("Chỉ gửi HK kiểm phòng trả khi khách đang ở");
  }
  const stays = await db.select().from(t.stays);
  const stay = data.stayId
    ? stays.find((row) => row.id === data.stayId)
    : sale
      ? stayForSale(stays, sale)
      : stays.find((row) => row.roomId === data.roomId && (row.status === "arriving" || row.status === "inhouse" || row.status === "departing"));
  const tasks = await listRoomHandoff(data.roomId);
  const open = openHandoff(tasks, data.purpose);
  if (open) return open.id;
  if (data.purpose !== "stayover" && doneHandoff(tasks, data.purpose)) {
    return doneHandoff(tasks, data.purpose)!.id;
  }
  const spec = handoffSpec(data.purpose, room.number, guestName);
  return createTask(user, {
    kind: spec.kind,
    stayId: data.stayId || stay?.id,
    fromDept: user.departmentCode,
    toDept: "hk",
    roomId: data.roomId,
    content: spec.content,
    formCode: spec.formCode,
  });
}

export async function onHkInspectDone(user: SessionUser, task: { id: string; kind: string; formCode: string | null; roomId: string | null; stayId: string | null; content: string }) {
  if (task.kind !== "inspect" || !task.roomId) return;
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, task.roomId)).limit(1))[0];
  if (!room) return;
  const sales = await db.select().from(t.roomSales);
  const stays = await db.select().from(t.stays);
  const sale = sales.find((row) => row.roomId === task.roomId && isActiveSaleStatus(row.status));
  const kind = receptionKindAfterInspect(task.formCode, sale?.status);
  if (kind === "checkin") {
    if (room.opsStatus !== "ooo") {
      await updateRoom(user, room.id, { hkStatus: "ins", opsStatus: "vacant_clean" });
    }
  }
  if (!kind) return;
  const stay = sale ? stayForSale(stays, sale) : stays.find((row) => row.id === task.stayId);
  await spawnRoomChecklist(db, {
    kind,
    guestName: sale?.guestName || stay?.guestName || "khách",
    roomNumber: room.number,
    roomId: room.id,
    stayId: stay?.id || task.stayId,
    actorId: user.id,
  });
  await notify({
    role: "reception",
    title: kind === "checkin" ? `P.${room.number} standby xong — nhận phòng` : `P.${room.number} HK đã kiểm — trả phòng`,
    body: task.content,
    link: stay?.id ? `/reception/${stay.id}` : `/rooms/${room.id}`,
  });
}

export async function spawnCheckoutClean(user: SessionUser, data: { roomId: string; stayId?: string | null; guestName: string; roomNumber: string }) {
  const tasks = await listRoomHandoff(data.roomId);
  const existing = tasks.find((task) => task.kind === "checkout_clean" && isOpenTaskStatus(task.status));
  if (existing) return existing.id;
  return createTask(user, {
    kind: "checkout_clean",
    stayId: data.stayId || undefined,
    fromDept: user.departmentCode,
    roomId: data.roomId,
    content: `Dọn phòng trả P.${data.roomNumber} — ${data.guestName}`,
  });
}

export async function assertSaleHandoff(kind: "checkin" | "checkout", roomId: string) {
  const tasks = await listRoomHandoff(roomId);
  const reason = handoffBlockReason(kind, tasks);
  if (reason) throw new Error(reason);
}

export function handoffState(tasks: Awaited<ReturnType<typeof listRoomHandoff>>) {
  return {
    standbyOpen: openHandoff(tasks, "standby"),
    standbyDone: doneHandoff(tasks, "standby"),
    stayoverOpen: openHandoff(tasks, "stayover"),
    inspectOpen: openHandoff(tasks, "checkout_inspect"),
    inspectDone: doneHandoff(tasks, "checkout_inspect"),
    canCheckin: canCheckinAfterStandby(tasks),
    canCheckout: canCheckoutAfterInspect(tasks),
  };
}
