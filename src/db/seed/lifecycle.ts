import { DEMO_PASSWORD } from "@/lib/constants";
import { currentShiftType, nowISO, todayVN, addMinutes } from "@/lib/datetime";
import { hashPassword } from "@/lib/password";
import { ROOM_SEED, floorOf, roomIdOf } from "@/lib/rooms-catalog";
import { insertInBatches } from "../batch";
import type { AppDb } from "../index";
import * as t from "../schema";
import { DEPT_SEED, DEMO_ROOM_OPS, LOCAL_STAFF, onDutyReceptionist, staffForSeed } from "./data";
import { seedDemoOps } from "./demo-ops";
import { seedDemoSales } from "./demo-sales";
import { seedDemoStays } from "./demo-stays";
import { syncReceptionRoster, syncRoomCatalog, syncStaffUsers, syncTaskKinds } from "./sync";

export async function resetOpsDemo(db: AppDb) {
  await db.delete(t.checklistItems);
  await db.delete(t.checklists);
  await db.delete(t.handoverItems);
  await db.delete(t.handovers);
  await db.delete(t.taskHistory);
  await db.delete(t.tasks);
  await db.delete(t.guestRequests);
  await db.delete(t.vehicles);
  await db.delete(t.stays);
  await db.delete(t.saleExtras);
  await db.delete(t.roomSales);
  await db.delete(t.shifts);
  await db.delete(t.breakfasts);
  await db.delete(t.incidents);
  await db.delete(t.notifications);
  await db.delete(t.formSubmissions);
  await db.delete(t.auditLogs);
  await seedOpsDemo(db);
  await syncTaskKinds(db);
}

export async function wipeAllLocal(db: AppDb) {
  await db.delete(t.checklistItems);
  await db.delete(t.checklists);
  await db.delete(t.handoverItems);
  await db.delete(t.handovers);
  await db.delete(t.taskHistory);
  await db.delete(t.tasks);
  await db.delete(t.guestRequests);
  await db.delete(t.vehicles);
  await db.delete(t.stays);
  await db.delete(t.saleExtras);
  await db.delete(t.roomSales);
  await db.delete(t.shifts);
  await db.delete(t.breakfasts);
  await db.delete(t.incidents);
  await db.delete(t.notifications);
  await db.delete(t.formSubmissions);
  await db.delete(t.auditLogs);
  await db.delete(t.pushSubscriptions);
  await db.delete(t.receptionDayOverrides);
  await db.delete(t.receptionWeekSlots);
  await db.delete(t.rooms);
  await db.delete(t.saleExtraTypes);
  await db.delete(t.roomTypes);
  await db.delete(t.users);
  await db.delete(t.departments);
  await seed(db);
  const hash = await hashPassword(DEMO_PASSWORD);
  const now = nowISO();
  const existing = await db.select({ username: t.users.username }).from(t.users);
  const have = new Set(existing.map((row) => row.username));
  for (const person of LOCAL_STAFF) {
    if (have.has(person.username)) continue;
    await db.insert(t.users).values({
      ...person,
      passwordHash: hash,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  await syncStaffUsers(db, { resetPasswords: true });
  await syncRoomCatalog(db);
  await syncReceptionRoster(db);
}

export async function seed(db: AppDb) {
    const now = nowISO();
    const hash = await hashPassword(DEMO_PASSWORD);
  
    const hasUsers = (await db.select({ id: t.users.id }).from(t.users).limit(1)).length > 0;
    if (!hasUsers) {
      await db.insert(t.departments).values([...DEPT_SEED]);
    }
  
    if (!hasUsers) {
      await db.insert(t.users).values(
        staffForSeed().map((p) => ({
          ...p,
          passwordHash: hash,
          active: true,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  
    await insertInBatches(
      (rows) => db.insert(t.rooms).values(rows),
      ROOM_SEED.map(({ number, type }) => {
        const demo = DEMO_ROOM_OPS[number];
        return {
          id: roomIdOf(number),
          number,
          floor: floorOf(number),
          type,
          opsStatus: demo?.ops ?? "vacant_clean",
          hkStatus: demo?.hk ?? "ins",
          assignedTo: demo?.assignedTo ?? null,
          oooReason: null,
          oooApproved: false,
          notes: null,
          updatedAt: now,
          updatedBy: null,
        };
      }),
      5,
    );
  
    await seedOpsDemo(db);
  
}

export async function seedOpsDemo(db: AppDb) {
  const now = nowISO();
  const today = todayVN();
  const checkinAt = addMinutes(now, -8);
  const shiftType = currentShiftType();
  const dutyId = onDutyReceptionist(shiftType);
  const ctx = { now, today, checkinAt, shiftType, dutyId };
  await seedDemoStays(db, ctx);
  await seedDemoSales(db, ctx);
  await seedDemoOps(db, ctx);
}
