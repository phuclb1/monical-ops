import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { nid, nowISO, nextShiftSlot, todayVN } from "../datetime";
import { DEPT_LABEL, HK_LABEL, TASK_STATUS_LABEL, requestKindLabel } from "../constants";
import { taskTypeLabel } from "../task-types";
import { stayBoardStatus } from "../stay-checklist";
import type { DepartmentCode, HkStatus, SessionUser, ShiftType, TaskStatus } from "../types";
import { audit } from "./audit";
import { listRooms } from "./rooms";
import { receptionDuty } from "./roster";
import { currentOpenShift } from "./shifts";
import { listStays } from "./stays";
import { listTasks } from "./tasks";

export async function pendingHandover() {
  const db = await getDb();
  const rows = await db.select().from(t.handovers).where(eq(t.handovers.status, "submitted")).orderBy(desc(t.handovers.createdAt)).limit(1);
  if (!rows[0]) return null;
  const items = await db.select().from(t.handoverItems).where(eq(t.handoverItems.handoverId, rows[0].id));
  return { ...rows[0], items };
}

export async function listHandovers() {
  const db = await getDb();
  const rows = await db.select().from(t.handovers).orderBy(desc(t.handovers.createdAt));
  const items = await db.select().from(t.handoverItems);
  const users = await db.select().from(t.users);
  return rows.map((h) => ({
    ...h,
    items: items.filter((i) => i.handoverId === h.id),
    creator: users.find((u) => u.id === h.createdBy),
    acceptor: users.find((u) => u.id === h.acceptedBy),
  }));
}

function stayTag(s: { pmsCode: string; guestName: string; room?: { number: string } | null }) {
  return `${s.pmsCode} ${s.guestName} — P.${s.room?.number || "—"}`;
}

export async function buildHandoverDraft() {
  const stays = await listStays();
  const rooms = await listRooms();
  const tasks = await listTasks();
  const requests = stays.flatMap((s) => s.requests.map((r) => ({ ...r, room: s.room?.number })));
  const items: { category: string; refType: string; refId: string; summary: string }[] = [];
  const openTask = new Set(["new", "accepted", "in_progress"]);
  const today = todayVN();

  for (const s of stays.filter((x) => stayBoardStatus(x, today) === "arriving")) {
    items.push({ category: "Khách đến chưa nhận", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => x.status === "no_show")) {
    items.push({ category: "Khách chưa đến", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => ["arriving", "inhouse", "departing", "no_show"].includes(stayBoardStatus(x, today)) && x.notes)) {
    items.push({
      category: "Ghi chú khách",
      refType: "stay",
      refId: s.id,
      summary: `P.${s.room?.number || "—"} ${s.guestName}: ${s.notes}`,
    });
  }
  for (const s of stays.filter((x) => stayBoardStatus(x, today) === "inhouse" && x.registrationDueAt && !x.registrationDoneAt)) {
    items.push({ category: "Đăng ký lưu trú chưa xong", refType: "stay", refId: s.id, summary: stayTag(s) });
  }
  for (const s of stays.filter((x) => stayBoardStatus(x, today) === "departing" && (!x.invoiceOk || !x.pmsCheckoutOk))) {
    items.push({
      category: "Khách đi — hóa đơn / PMS",
      refType: "stay",
      refId: s.id,
      summary: `${stayTag(s)} chưa xác nhận hóa đơn hoặc check-out PMS`,
    });
  }
  for (const s of stays) {
    for (const v of s.vehicles) {
      const bits = [`P.${s.room?.number || "—"}`, v.vehicleType, v.plate];
      if (v.location) bits.push(v.location);
      if (v.keyLocation) bits.push(`chìa ${v.keyLocation}`);
      items.push({ category: "Khách gửi xe", refType: "vehicle", refId: v.id, summary: bits.join(" · ") });
    }
  }
  for (const r of requests.filter((x) => x.status === "open")) {
    const qty = r.quantity > 1 ? ` ×${r.quantity}` : "";
    items.push({
      category: "Yêu cầu khách chưa xong",
      refType: "request",
      refId: r.id,
      summary: `P.${r.room || "—"} ${requestKindLabel(r.kind)}: ${r.content}${qty}`,
    });
  }
  for (const task of tasks.filter((x) => openTask.has(x.status) || x.status === "blocked")) {
    const room = rooms.find((rm) => rm.id === task.roomId);
    const loc = room ? `P.${room.number}` : task.area || DEPT_LABEL[task.toDept as DepartmentCode] || task.toDept;
    const status = TASK_STATUS_LABEL[task.status as TaskStatus] || task.status;
    const extra =
      task.status === "blocked" && task.blockedReason
        ? ` — vướng: ${task.blockedReason}`
        : task.zaloSent
          ? ""
          : " · chưa gửi Zalo";
    items.push({
      category: task.status === "blocked" ? "Việc vướng" : "Việc đang dở",
      refType: "task",
      refId: task.id,
      summary: `${loc}: ${taskTypeLabel(task.kind)} — ${task.content} (${status})${extra}`,
    });
  }
  for (const r of rooms.filter((x) => x.opsStatus === "ooo")) {
    items.push({ category: "Phòng OOO / đang sửa", refType: "room", refId: r.id, summary: `P.${r.number} ${r.oooReason || ""}` });
  }
  for (const r of rooms.filter(
    (x) =>
      x.opsStatus !== "ooo" &&
      (["vacant_dirty", "cleaning", "waiting_inspect"].includes(x.opsStatus) ||
        ["waiting", "accepted", "cleaning", "waiting_inspect"].includes(x.hkStatus)),
  )) {
    items.push({
      category: "Phòng đang dọn / chờ kiểm",
      refType: "room",
      refId: r.id,
      summary: `P.${r.number} ${HK_LABEL[r.hkStatus as HkStatus] || r.hkStatus}`,
    });
  }
  return items;
}

export async function createHandover(user: SessionUser, notes: string) {
  const db = await getDb();
  const shift = await currentOpenShift();
  if (!shift) throw new Error("Hãy mở ca trước khi bàn giao");
  const existing = (await db.select().from(t.handovers).where(eq(t.handovers.fromShiftId, shift.id)))[0];
  if (existing) return existing.id;
  const id = nid();
  const items = await buildHandoverDraft();
  await db.insert(t.handovers).values({
    id,
    fromShiftId: shift.id,
    toShiftType: nextShift(shift.type as ShiftType),
    status: "submitted",
    createdBy: user.id,
    createdAt: nowISO(),
    acceptedBy: null,
    acceptedAt: null,
    notes,
  });
  if (items.length) {
    await db.insert(t.handoverItems).values(
      items.map((item) => ({
        id: nid(),
        handoverId: id,
        category: item.category,
        refType: item.refType,
        refId: item.refId,
        summary: item.summary,
        note: null,
      })),
    );
  }
  const next = nextShiftSlot(shift.type as ShiftType, shift.date);
  const nextDuty = await receptionDuty(next.date, next.type);
  await notify({
    userId: nextDuty.userId,
    role: "reception",
    title: "Bàn giao ca mới",
    body: `${user.fullName} đã gửi bàn giao. Ca sau cần bấm Đã nhận.`,
    link: `/handover/${id}`,
  });
  await audit(user.id, "handover", id, "create", null, { notes, count: items.length });
  return id;
}

export async function acceptHandover(user: SessionUser, id: string) {
  const db = await getDb();
  const ho = (await db.select().from(t.handovers).where(eq(t.handovers.id, id)))[0];
  if (!ho) throw new Error("Không tìm thấy bàn giao");
  if (ho.acceptedBy) throw new Error("Bàn giao đã được nhận");
  await db.update(t.handovers).set({ status: "accepted", acceptedBy: user.id, acceptedAt: nowISO() }).where(eq(t.handovers.id, id));
  await audit(user.id, "handover", id, "accept", ho, { acceptedBy: user.id });
}

function nextShift(type: ShiftType): ShiftType {
  if (type === "morning") return "afternoon";
  if (type === "afternoon") return "night";
  return "morning";
}
