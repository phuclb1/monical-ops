import { eq, inArray } from "drizzle-orm";
import { DEMO_PASSWORD } from "@/lib/constants";
import { addDaysVN, nid, nowISO, todayVN, WEEKDAYS } from "@/lib/datetime";
import { EXTRA_TYPE_SEED } from "@/lib/extras";
import { hashPassword } from "@/lib/password";
import { ROOM_REMAP, ROOM_SEED, ROOM_TYPE_SEED, defaultAdultsForRoomType, floorOf, roomIdOf } from "@/lib/rooms-catalog";
import { DEFAULT_WEEK_DUTY, ROSTER_SHIFTS, weekSlotId } from "@/lib/roster";
import { insertInBatches } from "../batch";
import type { AppDb } from "../index";
import * as t from "../schema";
import { DEPT_SEED, LOCAL_STAFF, LOCAL_WEEK_DUTY, RETIRED_USERNAMES, STAFF_SEED, staffForSeed } from "./data";

export async function syncRoomTypeAdults(db: AppDb) {
  try {
    const types = await db.select().from(t.roomTypes);
    for (const type of types) {
      if (type.adults && type.adults > 0) continue;
      await db.update(t.roomTypes).set({ adults: defaultAdultsForRoomType(type.name) }).where(eq(t.roomTypes.id, type.id));
    }
  } catch {
    // adults column may still be missing on a half-patched DB
  }
}

export async function syncLegacyRoomDiscounts(db: AppDb) {
  try {
    const rows = await db.select({ id: t.roomSales.id, discountKind: t.roomSales.discountKind, discountValue: t.roomSales.discountValue }).from(t.roomSales);
    for (const row of rows) {
      if (row.discountKind !== "percent" || row.discountValue <= 100) continue;
      await db.update(t.roomSales).set({ discountKind: "amount" }).where(eq(t.roomSales.id, row.id));
    }
  } catch {
    // discount columns may still be missing on a half-patched DB
  }
}

export async function syncDemoPerRoomDiscount(db: AppDb) {
  const rows = await db.select().from(t.roomSales).where(inArray(t.roomSales.id, ["sale-304", "sale-404"]));
  if (!rows.length) return;
  for (const row of rows) {
    const notes = row.notes?.includes("tổng booking") ? "Đoàn 2 phòng" : row.notes;
    const clearCk = row.id === "sale-404" && row.discountKind === "amount" && row.discountValue === 200000;
    if (!clearCk && notes === row.notes) continue;
    await db
      .update(t.roomSales)
      .set({
        ...(clearCk ? { discountKind: "none" as const, discountValue: 0 } : {}),
        notes,
      })
      .where(eq(t.roomSales.id, row.id));
  }
}

export async function syncSalePaymentSplit(db: AppDb) {
  try {
    const rows = await db.select({
      id: t.roomSales.id,
      deposit: t.roomSales.deposit,
      cashPaid: t.roomSales.cashPaid,
      transferPaid: t.roomSales.transferPaid,
      companyPaid: t.roomSales.companyPaid,
    }).from(t.roomSales);
    for (const row of rows) {
      if (row.deposit <= 0 || row.cashPaid + row.transferPaid + (row.companyPaid || 0) > 0) continue;
      await db.update(t.roomSales).set({ transferPaid: row.deposit }).where(eq(t.roomSales.id, row.id));
    }
  } catch {
    // payment columns may still be missing on a half-patched DB
  }
}

export async function syncTaskKinds(db: AppDb) {
  const patches = [
    { id: "task-305-towels", kind: "towels" as const, stayId: "s-305" },
    { id: "task-202-housekeeping", kind: "housekeeping" as const, stayId: "s-202" },
    { id: "task-102-checkout", kind: "checkout_clean" as const, stayId: "s-102" },
    { id: "task-extra-hk", kind: "public_area" as const, stayId: null as string | null },
  ];
  for (const row of patches) {
    await db.update(t.tasks).set({ kind: row.kind, stayId: row.stayId }).where(eq(t.tasks.id, row.id));
  }
}

export async function syncReceptionRoster(db: AppDb) {
  const existing = await db.select({ id: t.receptionWeekSlots.id }).from(t.receptionWeekSlots).limit(1);
  if (existing.length) return;
  const users = await db.select({ id: t.users.id }).from(t.users);
  const ids = new Set(users.map((row) => row.id));
  const duty =
    ids.has(LOCAL_WEEK_DUTY.morning) && ids.has(LOCAL_WEEK_DUTY.afternoon) && ids.has(LOCAL_WEEK_DUTY.night)
      ? LOCAL_WEEK_DUTY
      : DEFAULT_WEEK_DUTY;
  const from = todayVN();
  const rows = WEEKDAYS.flatMap((day) =>
    ROSTER_SHIFTS.filter((shift) => ids.has(duty[shift])).map((shift) => ({
      id: weekSlotId(day.iso, shift, from),
      weekday: day.iso,
      shiftType: shift,
      userId: duty[shift],
      effectiveFrom: from,
    })),
  );
  if (rows.length) {
    await insertInBatches((batch) => db.insert(t.receptionWeekSlots).values(batch), rows);
  }
}

export async function syncRoomCatalog(db: AppDb, opts?: { prune?: boolean }) {
  const now = nowISO();
  const types = await db.select().from(t.roomTypes);
  const typeByCode = new Map(types.map((row) => [row.code, row]));
  const typeById = new Map(types.map((row) => [row.id, row]));

  for (const type of ROOM_TYPE_SEED) {
    const found = typeByCode.get(type.code) ?? typeById.get(type.id);
    if (!found) {
      await db.insert(t.roomTypes).values(type);
      continue;
    }
    await db
      .update(t.roomTypes)
      .set({ name: type.name, sortOrder: type.sortOrder, code: type.code })
      .where(eq(t.roomTypes.id, found.id));
  }

  const rooms = await db.select().from(t.rooms);
  const byNumber = new Map(rooms.map((row) => [row.number, row]));
  const official = new Set<string>(ROOM_SEED.map((row) => row.number));

  for (const [fromId, toId] of Object.entries(ROOM_REMAP)) {
    await remapRoomRefs(db, fromId, toId);
  }

  for (const def of ROOM_SEED) {
    const found = byNumber.get(def.number);
    if (!found) {
      await db.insert(t.rooms).values({
        id: roomIdOf(def.number),
        number: def.number,
        floor: floorOf(def.number),
        type: def.type,
        opsStatus: "vacant_clean",
        hkStatus: "ins",
        assignedTo: null,
        oooReason: null,
        oooApproved: false,
        notes: null,
        updatedAt: now,
        updatedBy: null,
      });
      continue;
    }
    await db
      .update(t.rooms)
      .set({ floor: floorOf(def.number), type: def.type, updatedAt: now })
      .where(eq(t.rooms.id, found.id));
  }

  if (!opts?.prune) return;
  const extra = rooms.filter((row) => !official.has(row.number));
  for (const room of extra) {
    await remapRoomRefs(db, room.id, ROOM_REMAP[room.id] ?? null);
    await db.delete(t.rooms).where(eq(t.rooms.id, room.id));
  }
}

export async function syncExtraCatalog(db: AppDb) {
  const rows = await db.select().from(t.saleExtraTypes);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const type of EXTRA_TYPE_SEED) {
    const found = byCode.get(type.code) ?? byId.get(type.id);
    if (!found) {
      await db.insert(t.saleExtraTypes).values({ ...type, active: true });
      continue;
    }
    await db
      .update(t.saleExtraTypes)
      .set({ name: type.name, unit: type.unit, unitLabel: type.unitLabel, sortOrder: type.sortOrder, code: type.code })
      .where(eq(t.saleExtraTypes.id, found.id));
  }
}

async function remapRoomRefs(db: AppDb, fromId: string, toId: string | null) {
  await db.update(t.stays).set({ roomId: toId }).where(eq(t.stays.roomId, fromId));
  await db.update(t.tasks).set({ roomId: toId }).where(eq(t.tasks.roomId, fromId));
  await db.update(t.guestRequests).set({ roomId: toId }).where(eq(t.guestRequests.roomId, fromId));
  await db.update(t.formSubmissions).set({ roomId: toId }).where(eq(t.formSubmissions.roomId, fromId));
  await db.update(t.incidents).set({ roomId: toId }).where(eq(t.incidents.roomId, fromId));
  if (toId) await db.update(t.roomSales).set({ roomId: toId }).where(eq(t.roomSales.roomId, fromId));
  else await db.delete(t.roomSales).where(eq(t.roomSales.roomId, fromId));
}

export async function syncDepartments(db: AppDb) {
  const existing = await db.select().from(t.departments);
  const haveId = new Set(existing.map((row) => row.id));
  const haveCode = new Set(existing.map((row) => row.code));
  for (const dept of DEPT_SEED) {
    if (haveId.has(dept.id) || haveCode.has(dept.code)) continue;
    await db.insert(t.departments).values(dept);
    haveId.add(dept.id);
    haveCode.add(dept.code);
  }
}

export async function syncStaffUsers(db: AppDb, opts?: { resetPasswords?: boolean }) {
  const now = nowISO();
  const hash = await hashPassword(DEMO_PASSWORD);
  const existing = await db.select().from(t.users);
  const byUsername = new Map(existing.map((u) => [u.username, u]));
  const byId = new Map(existing.map((u) => [u.id, u]));

  for (const person of STAFF_SEED) {
    const found = byUsername.get(person.username) ?? byId.get(person.id);
    if (!found) {
      await db.insert(t.users).values({
        ...person,
        passwordHash: hash,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }
    if (opts?.resetPasswords) {
      await db.update(t.users).set({ passwordHash: hash, active: true, updatedAt: now }).where(eq(t.users.id, found.id));
    }
  }

  await db
    .update(t.users)
    .set({ active: false, updatedAt: now })
    .where(inArray(t.users.username, [...RETIRED_USERNAMES]));
}

export async function userByUsername(db: AppDb, username: string) {
  const rows = await db.select().from(t.users).where(eq(t.users.username, username)).limit(1);
  return rows[0] ?? null;
}
