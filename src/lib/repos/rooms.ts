import { cache } from "react";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { notify } from "@/modules/notifications/models/notifications";
import { nowISO } from "../datetime";
import { can } from "../permissions";
import { isActiveSaleStatus } from "../sales";
import { defaultAdultsForRoomType, floorOf, roomIdOf, slugTypeName } from "../rooms-catalog";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export const listRooms = cache(async () => {
  const db = await getDb();
  return db.select().from(t.rooms);
});

export const listRoomTypes = cache(async () => {
  const db = await getDb();
  return db.select().from(t.roomTypes).orderBy(t.roomTypes.sortOrder, t.roomTypes.name);
});

export async function listRoomBusyRanges() {
  const db = await getDb();
  const [sales, stays] = await Promise.all([
    db
      .select({
        roomId: t.roomSales.roomId,
        status: t.roomSales.status,
        checkIn: t.roomSales.checkIn,
        checkOut: t.roomSales.checkOut,
      })
      .from(t.roomSales),
    db
      .select({
        roomId: t.stays.roomId,
        status: t.stays.status,
        checkIn: t.stays.arrivalDate,
        checkOut: t.stays.departureDate,
      })
      .from(t.stays),
  ]);
  return [
    ...sales
      .filter((row) => isActiveSaleStatus(row.status))
      .map((row) => ({ roomId: row.roomId, checkIn: row.checkIn, checkOut: row.checkOut })),
    ...stays
      .filter((row) => row.roomId && ["arriving", "inhouse", "departing"].includes(row.status))
      .map((row) => ({ roomId: row.roomId as string, checkIn: row.checkIn, checkOut: row.checkOut })),
  ];
}

export async function createRoomType(
  actor: SessionUser,
  data: { name: string; adults?: number; baseRate?: number; weekendRate?: number },
) {
  const db = await getDb();
  const trimmed = data.name.trim().toUpperCase();
  if (!trimmed) throw new Error("Nhập tên hạng phòng");
  const code = slugTypeName(trimmed);
  if (!code) throw new Error("Tên hạng phòng không hợp lệ");
  const exists = (await db.select({ id: t.roomTypes.id }).from(t.roomTypes).where(or(eq(t.roomTypes.code, code), eq(t.roomTypes.name, trimmed))).limit(1))[0];
  if (exists) throw new Error("Hạng phòng đã tồn tại");
  const last = (await db.select().from(t.roomTypes).orderBy(desc(t.roomTypes.sortOrder)).limit(1))[0];
  const id = `rt-${code}`;
  const occupancy = defaultAdultsForRoomType(trimmed, data.adults);
  const record = {
    id,
    code,
    name: trimmed,
    sortOrder: (last?.sortOrder ?? 0) + 10,
    baseRate: Math.max(0, Math.round(data.baseRate || 0)),
    weekendRate: Math.max(0, Math.round(data.weekendRate || 0)),
    adults: occupancy,
  };
  await db.insert(t.roomTypes).values(record);
  await audit(actor.id, "room_type", id, "create", null, record);
  return id;
}

export async function updateRoomType(
  actor: SessionUser,
  id: string,
  data: { name: string; adults?: number; baseRate?: number; weekendRate?: number },
) {
  const db = await getDb();
  const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy hạng phòng");
  const trimmed = data.name.trim().toUpperCase();
  if (!trimmed) throw new Error("Nhập tên hạng phòng");
  const clash = (await db.select({ id: t.roomTypes.id }).from(t.roomTypes).where(and(eq(t.roomTypes.name, trimmed), ne(t.roomTypes.id, id))).limit(1))[0];
  if (clash) throw new Error("Tên hạng phòng đã dùng");
  const occupancy = defaultAdultsForRoomType(trimmed, data.adults ?? before.adults);
  const next = {
    name: trimmed,
    adults: occupancy,
    baseRate: Math.max(0, Math.round(data.baseRate ?? before.baseRate)),
    weekendRate: Math.max(0, Math.round(data.weekendRate ?? before.weekendRate)),
  };
  await db.update(t.roomTypes).set(next).where(eq(t.roomTypes.id, id));
  await db.update(t.rooms).set({ type: trimmed, updatedAt: nowISO(), updatedBy: actor.id }).where(eq(t.rooms.type, before.name));
  await audit(actor.id, "room_type", id, "update", before, next);
}

export async function deleteRoomType(actor: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy hạng phòng");
  const used = (await db.select({ id: t.rooms.id }).from(t.rooms).where(eq(t.rooms.type, before.name)).limit(1))[0];
  if (used) throw new Error("Còn phòng thuộc hạng này");
  await db.delete(t.roomTypes).where(eq(t.roomTypes.id, id));
  await audit(actor.id, "room_type", id, "delete", before, null);
}

export async function createManagedRoom(actor: SessionUser, number: string, typeName: string) {
  const db = await getDb();
  const num = number.trim();
  if (!/^\d{3,4}$/.test(num)) throw new Error("Số phòng 3–4 chữ số");
  const type = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.name, typeName.trim().toUpperCase())).limit(1))[0];
  if (!type) throw new Error("Chọn hạng phòng");
  const exists = (await db.select({ id: t.rooms.id }).from(t.rooms).where(eq(t.rooms.number, num)).limit(1))[0];
  if (exists) throw new Error("Số phòng đã tồn tại");
  const id = roomIdOf(num);
  const now = nowISO();
  await db.insert(t.rooms).values({
    id,
    number: num,
    floor: floorOf(num),
    type: type.name,
    opsStatus: "vacant_clean",
    hkStatus: "ins",
    assignedTo: null,
    oooReason: null,
    oooApproved: false,
    notes: null,
    updatedAt: now,
    updatedBy: actor.id,
  });
  await audit(actor.id, "room", id, "create", null, { number: num, type: type.name });
  return id;
}

export async function setRoomType(actor: SessionUser, id: string, typeName: string) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const type = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.name, typeName.trim().toUpperCase())).limit(1))[0];
  if (!type) throw new Error("Chọn hạng phòng");
  await db.update(t.rooms).set({ type: type.name, updatedAt: nowISO(), updatedBy: actor.id }).where(eq(t.rooms.id, id));
  await audit(actor.id, "room", id, "set_type", before, { type: type.name });
}

export async function deleteManagedRoom(actor: SessionUser, id: string) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const stays = await db.select().from(t.stays).where(eq(t.stays.roomId, id));
  if (stays.some((s) => ["inhouse", "arriving", "departing"].includes(s.status))) {
    throw new Error("Phòng đang có khách tham chiếu, không xóa");
  }
  const activeSales = await db.select().from(t.roomSales).where(eq(t.roomSales.roomId, id));
  if (activeSales.some((sale) => isActiveSaleStatus(sale.status))) {
    throw new Error("Phòng đang có chỗ bán, không xóa");
  }
  await db.update(t.stays).set({ roomId: null }).where(eq(t.stays.roomId, id));
  await db.update(t.tasks).set({ roomId: null }).where(eq(t.tasks.roomId, id));
  await db.update(t.guestRequests).set({ roomId: null }).where(eq(t.guestRequests.roomId, id));
  await db.update(t.formSubmissions).set({ roomId: null }).where(eq(t.formSubmissions.roomId, id));
  await db.update(t.incidents).set({ roomId: null }).where(eq(t.incidents.roomId, id));
  await db.delete(t.roomSales).where(eq(t.roomSales.roomId, id));
  await db.delete(t.rooms).where(eq(t.rooms.id, id));
  await audit(actor.id, "room", id, "delete", before, null);
}

export async function getRoom(id: string) {
  const db = await getDb();
  const room = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)))[0];
  if (!room) return null;
  const stay = (await db.select().from(t.stays).where(eq(t.stays.roomId, id)))[0];
  const items = await db.select().from(t.formSubmissions).where(and(eq(t.formSubmissions.roomId, id), eq(t.formSubmissions.formCode, "BM-06")));
  const incidents = await db.select().from(t.incidents).where(eq(t.incidents.roomId, id));
  return { room, stay, checklists: items, incidents };
}

export async function updateRoom(user: SessionUser, id: string, patch: Partial<{
  opsStatus: string;
  hkStatus: string;
  assignedTo: string | null;
  oooReason: string | null;
  oooApproved: boolean;
  notes: string | null;
}>) {
  const db = await getDb();
  const before = (await db.select().from(t.rooms).where(eq(t.rooms.id, id)))[0];
  if (!before) throw new Error("Không tìm thấy phòng");
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  await db
    .update(t.rooms)
    .set({ ...clean, updatedAt: nowISO(), updatedBy: user.id })
    .where(eq(t.rooms.id, id));
  if (patch.hkStatus === "ins" && before.hkStatus !== "ins") {
    await notify({
      role: "reception",
      title: `P.${before.number} đã INS`,
      body: `${user.fullName} chuyển phòng sang sẵn sàng nhận khách`,
      link: `/rooms/${id}`,
    });
  }
  if (patch.opsStatus === "ooo") {
    await notify({
      role: "manager",
      title: `P.${before.number} báo OOO`,
      body: patch.oooReason || "Cần duyệt ngừng bán phòng",
      link: `/rooms/${id}`,
    });
  }
  await audit(user.id, "room", id, "update", before, patch);
}

export async function setRoomTypeRates(user: SessionUser, rates: { id: string; baseRate: number; weekendRate: number }[]) {
  if (!can(user.role, "manageRates")) throw new Error("Chỉ quản lý sửa giá phòng");
  const db = await getDb();
  for (const row of rates) {
    const before = (await db.select().from(t.roomTypes).where(eq(t.roomTypes.id, row.id)).limit(1))[0];
    if (!before) continue;
    const next = { baseRate: Math.max(0, row.baseRate), weekendRate: Math.max(0, row.weekendRate) };
    await db.update(t.roomTypes).set(next).where(eq(t.roomTypes.id, row.id));
    if (before.baseRate !== next.baseRate || before.weekendRate !== next.weekendRate) {
      await audit(user.id, "room_type", row.id, "rate", before, next);
    }
  }
}
