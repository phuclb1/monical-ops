import { eq, inArray } from "drizzle-orm";
import { DEMO_PASSWORD } from "../constants";
import { addDaysVN, addMinutes, currentShiftType, nid, nowISO, todayVN, WEEKDAYS } from "../datetime";
import { hashPassword } from "../password";
import { ensureShiftChecklists, ensureTodayRoomTasks } from "../checklist-ops";
import type { AppDb } from "./index";
import * as t from "./schema";
import type { ShiftType } from "../types";
import { insertInBatches } from "./batch";
import { ROOM_REMAP, ROOM_SEED, ROOM_TYPE_SEED, floorOf, roomIdOf } from "../rooms-catalog";
import { EXTRA_TYPE_SEED } from "../extras";
import { DEFAULT_WEEK_DUTY, ROSTER_SHIFTS, weekSlotId } from "../roster";

export const STAFF_SEED = [
  { id: "u-quanly", username: "quanly", fullName: "Minh Quản lý", role: "manager", departmentId: "d-mgmt", phone: "+84901111007" },
] as const;

export const LOCAL_STAFF = [
  { id: "u-ngan", username: "ngan", fullName: "Ngân Lễ tân ca sáng", role: "reception", departmentId: "d-reception", phone: "+84901111001" },
  { id: "u-thu", username: "thu", fullName: "Thu Lễ tân ca chiều", role: "reception", departmentId: "d-reception", phone: "+84901111002" },
  { id: "u-tuyen", username: "tuyen", fullName: "Tuyến Lễ tân ca tối", role: "reception", departmentId: "d-reception", phone: "+84901111003" },
  { id: "u-uyen", username: "uyen", fullName: "Uyên HK", role: "hk", departmentId: "d-hk", phone: "+84901111004" },
] as const;

export const RETIRED_USERNAMES = ["letan", "hk", "bep", "tapvu", "ketoan"] as const;

const LOCAL_WEEK_DUTY: Record<ShiftType, string> = {
  morning: "u-ngan",
  afternoon: "u-thu",
  night: "u-tuyen",
};

function isLocalOpsSeed() {
  return process.env.NODE_ENV !== "production" && process.env.USE_D1 !== "1";
}

function staffForSeed() {
  return isLocalOpsSeed() ? [...STAFF_SEED, ...LOCAL_STAFF] : [...STAFF_SEED];
}

function onDutyReceptionist(type: ShiftType) {
  return LOCAL_WEEK_DUTY[type];
}

const DEMO_ROOM_OPS: Record<string, { ops: string; hk: string; assignedTo?: string }> = {
  "102": { ops: "occupied", hk: "ins" },
  "105": { ops: "vacant_clean", hk: "ins" },
  "202": { ops: "occupied", hk: "ins" },
  "305": { ops: "occupied", hk: "ins" },
};

export async function seedIfEmpty(db: AppDb) {
  const existing = await db.select({ id: t.rooms.id }).from(t.rooms).limit(1);
  if (!existing.length) await seed(db);
  await syncStaffUsers(db);
  await syncRoomCatalog(db);
  await syncExtraCatalog(db);
  await syncReceptionRoster(db);
  await syncTaskKinds(db);
  await syncLegacyRoomDiscounts(db);
  await syncDemoPerRoomDiscount(db);
  await syncSalePaymentSplit(db);
}

async function syncLegacyRoomDiscounts(db: AppDb) {
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

async function syncDemoPerRoomDiscount(db: AppDb) {
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

async function syncSalePaymentSplit(db: AppDb) {
  try {
    const rows = await db.select({
      id: t.roomSales.id,
      deposit: t.roomSales.deposit,
      cashPaid: t.roomSales.cashPaid,
      transferPaid: t.roomSales.transferPaid,
    }).from(t.roomSales);
    for (const row of rows) {
      if (row.deposit <= 0 || row.cashPaid + row.transferPaid > 0) continue;
      await db.update(t.roomSales).set({ transferPaid: row.deposit }).where(eq(t.roomSales.id, row.id));
    }
  } catch {
    // payment columns may still be missing on a half-patched DB
  }
}

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

export async function seed(db: AppDb) {
  const now = nowISO();
  const hash = await hashPassword(DEMO_PASSWORD);

  const depts = [
    { id: "d-reception", code: "reception", name: "Lễ tân" },
    { id: "d-hk", code: "hk", name: "Buồng phòng" },
    { id: "d-kitchen", code: "kitchen", name: "Bếp" },
    { id: "d-utility", code: "utility", name: "Tạp vụ" },
    { id: "d-mgmt", code: "management", name: "Quản lý" },
    { id: "d-acc", code: "accounting", name: "Kế toán" },
  ];
  const hasUsers = (await db.select({ id: t.users.id }).from(t.users).limit(1)).length > 0;
  if (!hasUsers) {
    await db.insert(t.departments).values(depts);
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
  const rooms = await db.select().from(t.rooms);
  for (const room of rooms) {
    const demo = DEMO_ROOM_OPS[room.number];
    await db
      .update(t.rooms)
      .set({
        opsStatus: demo?.ops ?? "vacant_clean",
        hkStatus: demo?.hk ?? "ins",
        assignedTo: demo?.assignedTo ?? null,
        oooReason: null,
        oooApproved: false,
        updatedAt: now,
      })
      .where(eq(t.rooms.id, room.id));
  }

  await db.insert(t.stays).values([
    {
      id: "s-201",
      pmsCode: "EZ-88502",
      origin: "ezcloud",
      source: "booking",
      roomId: "r-105",
      guestName: "Nguyễn Thu Hà",
      guestPhone: "0933333444",
      status: "arriving",
      arrivalDate: today,
      departureDate: addDaysVN(today, 3),
      adults: 2,
      children: 1,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: false,
      pmsCheckoutOk: false,
      invoiceOk: false,
      paymentNote: null,
      checkinAt: null,
      registrationDueAt: null,
      registrationDoneAt: null,
      registrationReason: null,
      notes: "Đang check-in · ăn chay, dị ứng hải sản",
      createdAt: now,
      updatedAt: now,
      createdBy: dutyId,
      updatedBy: dutyId,
    },
    {
      id: "s-305",
      pmsCode: "EZ-88421",
      origin: "ezcloud",
      source: "agoda",
      roomId: "r-305",
      guestName: "Trần Minh Khoa",
      guestPhone: "0912345678",
      status: "inhouse",
      arrivalDate: today,
      departureDate: addDaysVN(today, 2),
      adults: 2,
      children: 0,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      paymentNote: null,
      checkinAt,
      registrationDueAt: addMinutes(checkinAt, 30),
      registrationDoneAt: null,
      registrationReason: null,
      notes: "Vừa nhận phòng · gửi ô tô hầm B1",
      createdAt: now,
      updatedAt: now,
      createdBy: dutyId,
      updatedBy: dutyId,
    },
    {
      id: "s-202",
      pmsCode: "EZ-88310",
      origin: "ezcloud",
      source: "traveloka",
      roomId: "r-202",
      guestName: "Lê Thị Hạnh",
      guestPhone: "0987654321",
      status: "inhouse",
      arrivalDate: addDaysVN(today, -1),
      departureDate: addDaysVN(today, 1),
      adults: 1,
      children: 1,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      paymentNote: null,
      checkinAt: addMinutes(now, -800),
      registrationDueAt: addMinutes(now, -770),
      registrationDoneAt: addMinutes(now, -780),
      registrationReason: null,
      notes: "Khách gọi dọn phòng 14:00",
      createdAt: now,
      updatedAt: now,
      createdBy: dutyId,
      updatedBy: dutyId,
    },
    {
      id: "s-102",
      pmsCode: "EZ-88201",
      origin: "ezcloud",
      source: "ezcloud",
      roomId: "r-102",
      guestName: "Phạm Đức Anh",
      guestPhone: "0908888777",
      status: "departing",
      arrivalDate: addDaysVN(today, -2),
      departureDate: today,
      adults: 2,
      children: 0,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      paymentNote: null,
      checkinAt: addMinutes(now, -3000),
      registrationDueAt: addMinutes(now, -2970),
      registrationDoneAt: addMinutes(now, -2980),
      registrationReason: null,
      notes: "Checkout 12:00, còn thiếu hóa đơn",
      createdAt: now,
      updatedAt: now,
      createdBy: dutyId,
      updatedBy: dutyId,
    },
  ]);

  if (isLocalOpsSeed()) {
    await db.insert(t.roomSales).values([
      {
        id: "sale-401",
        bookingId: "sale-401",
        roomId: "r-401",
        guestName: "Đặng Minh Tuấn",
        guestPhone: "0901222333",
        origin: "ops",
        source: "walk_in",
        status: "inhouse",
        checkIn: today,
        checkOut: addDaysVN(today, 2),
        adults: 2,
        children: 0,
        rate: 1200000,
        discountKind: "none",
        discountValue: 0,
        deposit: 500000,
        cashPaid: 500000,
        transferPaid: 0,
        pmsCode: null,
        notes: "Vãng lai, nhận chiều",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
      {
        id: "sale-508",
        bookingId: "sale-508",
        roomId: "r-508",
        guestName: "Mai Thanh Hà",
        guestPhone: "0918888999",
        origin: "ops",
        source: "phone",
        status: "reserved",
        checkIn: addDaysVN(today, 1),
        checkOut: addDaysVN(today, 3),
        adults: 2,
        children: 1,
        rate: 950000,
        discountKind: "none",
        discountValue: 0,
        deposit: 300000,
        cashPaid: 0,
        transferPaid: 300000,
        pmsCode: null,
        notes: "Gọi giữ chỗ, ETA 15:00",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
      {
        id: "sale-506",
        bookingId: "sale-506",
        roomId: "r-506",
        guestName: "Công ty An Phú",
        guestPhone: "0283999000",
        origin: "ops",
        source: "company",
        status: "reserved",
        checkIn: today,
        checkOut: addDaysVN(today, 1),
        adults: 2,
        children: 0,
        rate: 2500000,
        discountKind: "percent",
        discountValue: 10,
        deposit: 0,
        cashPaid: 0,
        transferPaid: 0,
        pmsCode: null,
        notes: "VIP công ty — cần hoa",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
      {
        id: "sale-304",
        bookingId: "bk-doan",
        roomId: "r-304",
        guestName: "Đoàn Minh Châu",
        guestPhone: "0903777888",
        origin: "ops",
        source: "company",
        status: "reserved",
        checkIn: today,
        checkOut: addDaysVN(today, 2),
        adults: 4,
        children: 1,
        rate: 800000,
        discountKind: "amount",
        discountValue: 200000,
        deposit: 1000000,
        cashPaid: 0,
        transferPaid: 1000000,
        pmsCode: null,
        notes: "Đoàn 2 phòng",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
      {
        id: "sale-404",
        bookingId: "bk-doan",
        roomId: "r-404",
        guestName: "Đoàn Minh Châu",
        guestPhone: "0903777888",
        origin: "ops",
        source: "company",
        status: "reserved",
        checkIn: today,
        checkOut: addDaysVN(today, 2),
        adults: 4,
        children: 1,
        rate: 1200000,
        discountKind: "none",
        discountValue: 0,
        deposit: 1000000,
        cashPaid: 0,
        transferPaid: 1000000,
        pmsCode: null,
        notes: "Đoàn 2 phòng",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
      {
        id: "sale-103",
        bookingId: "sale-103",
        roomId: "r-103",
        guestName: "Lê Hoàng Nam",
        guestPhone: "0905555666",
        origin: "ops",
        source: "walk_in",
        status: "departed",
        checkIn: addDaysVN(today, -2),
        checkOut: today,
        adults: 2,
        children: 0,
        rate: 900000,
        discountKind: "none",
        discountValue: 0,
        deposit: 1800000,
        cashPaid: 800000,
        transferPaid: 1000000,
        pmsCode: null,
        notes: "Đã trả phòng, thu đủ",
        createdAt: now,
        updatedAt: now,
        createdBy: dutyId,
        updatedBy: dutyId,
      },
    ]);
    const seededSales = await db.select().from(t.roomSales);
    if (seededSales.length) {
      await db.insert(t.auditLogs).values(
        seededSales.map((row) => ({
          id: `audit-${row.id}-create`,
          entity: "room_sale",
          entityId: row.id,
          action: "create",
          actorId: row.createdBy || dutyId,
          beforeJson: null,
          afterJson: JSON.stringify(row),
          createdAt: row.createdAt,
        })),
      );
      await db.insert(t.auditLogs).values({
        id: "audit-sale-401-phone",
        entity: "room_sale",
        entityId: "sale-401",
        action: "update",
        actorId: dutyId,
        beforeJson: JSON.stringify({ guestPhone: "0901111222" }),
        afterJson: JSON.stringify({ guestPhone: "0901222333" }),
        createdAt: addMinutes(now, 18),
      });
    }
  }

  await db.insert(t.vehicles).values({
    id: nid(),
    stayId: "s-305",
    vehicleType: "Ô tô",
    plate: "51H-223.18",
    location: "Hầm B1-12",
    keyLocation: "Hộc lễ tân số 3",
    notes: "Khách gửi xe khi check-in",
    createdAt: now,
  });

  const curShiftId = "shift-current";
  await db.insert(t.shifts).values({
    id: curShiftId,
    type: shiftType,
    date: today,
    status: "open",
    openedAt: addMinutes(now, -15),
    openedBy: dutyId,
    closedAt: null,
    closedBy: null,
    closeReason: null,
  });

  const curShift = (await db.select().from(t.shifts).where(eq(t.shifts.id, curShiftId)))[0];
  await ensureShiftChecklists(db, curShift, { actorId: dutyId, assigneeId: dutyId });
  await ensureTodayRoomTasks(db, { actorId: dutyId, assigneeId: LOCAL_WEEK_DUTY.morning });

  const due = addMinutes(now, 90);
  const tasks = [
    {
      id: "task-305-towels",
      kind: "towels",
      stayId: "s-305",
      fromDept: "reception",
      toDept: "hk",
      roomId: "r-305",
      area: null as string | null,
      content: "Thay 2 khăn tắm P.305",
      priority: "normal",
      assigneeId: "u-uyen",
      createdBy: dutyId,
      createdAt: addMinutes(now, -6),
      note: "Khách inhouse gọi thay khăn",
    },
    {
      id: "task-202-housekeeping",
      kind: "housekeeping",
      stayId: "s-202",
      fromDept: "reception",
      toDept: "hk",
      roomId: "r-202",
      area: null,
      content: "Dọn phòng khách ở P.202 — 14:00",
      priority: "normal",
      assigneeId: "u-uyen",
      createdBy: dutyId,
      createdAt: addMinutes(now, -10),
      note: "Khách gọi dọn giữa ngày",
    },
    {
      id: "task-102-checkout",
      kind: "checkout_clean",
      stayId: "s-102",
      fromDept: "reception",
      toDept: "hk",
      roomId: "r-102",
      area: null,
      content: "Dọn phòng trả P.102 — checkout 12:00",
      priority: "priority",
      assigneeId: "u-uyen",
      createdBy: dutyId,
      createdAt: addMinutes(now, -20),
      note: "Gửi HK dọn phòng trả",
    },
    {
      id: "task-extra-hk",
      kind: "public_area",
      stayId: null,
      fromDept: "management",
      toDept: "hk",
      roomId: null,
      area: "Tầng 2–3",
      content: "Cần thêm HK ca này — hỗ trợ dồn dọn tầng 2 và 3",
      priority: "priority",
      assigneeId: "u-uyen",
      createdBy: "u-quanly",
      createdAt: addMinutes(now, -4),
      note: "Quản lý yêu cầu thêm HK",
    },
  ];

  for (const row of tasks) {
    await db.insert(t.tasks).values({
      id: row.id,
      kind: row.kind,
      stayId: row.stayId,
      fromDept: row.fromDept,
      toDept: row.toDept,
      roomId: row.roomId,
      area: row.area,
      content: row.content,
      priority: row.priority,
      assigneeId: row.assigneeId,
      dueAt: due,
      formCode: "BM-13",
      status: "new",
      blockedReason: null,
      blockedAction: null,
      zaloMessage: null,
      zaloSent: false,
      zaloSentAt: null,
      photo: null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedBy: row.createdBy,
      updatedAt: row.createdAt,
    });
    await db.insert(t.taskHistory).values({
      id: nid(),
      taskId: row.id,
      fromStatus: null,
      toStatus: "new",
      actorId: row.createdBy,
      note: row.note,
      createdAt: row.createdAt,
    });
  }

  await db.insert(t.breakfasts).values({
    id: nid(),
    date: addDaysVN(today, 1),
    adults: 7,
    children: 2,
    vegetarian: 2,
    allergy: 1,
    early: 0,
    takeaway: 0,
    notes: "P.105 ăn chay + dị ứng hải sản · P.305 2 NL · P.202 1 NL 1 TE · P.102 checkout không tính",
    sentBy: dutyId,
    confirmedBy: null,
    confirmedAt: null,
    actualAdults: null,
    actualChildren: null,
    updatedAt: now,
  });

  await db.insert(t.notifications).values([
    {
      id: nid(),
      userId: "u-uyen",
      role: "hk",
      title: "Thay khăn P.305",
      body: "Khách Trần Minh Khoa cần 2 khăn tắm",
      link: "/tasks/task-305-towels",
      read: false,
      createdAt: addMinutes(now, -6),
    },
    {
      id: nid(),
      userId: "u-uyen",
      role: "hk",
      title: "Dọn phòng P.202",
      body: "Lê Thị Hạnh gọi dọn 14:00",
      link: "/tasks/task-202-housekeeping",
      read: false,
      createdAt: addMinutes(now, -10),
    },
    {
      id: nid(),
      userId: "u-uyen",
      role: "hk",
      title: "Quản lý cần thêm HK",
      body: "Hỗ trợ dồn dọn tầng 2 và 3 ca này",
      link: "/tasks/task-extra-hk",
      read: false,
      createdAt: addMinutes(now, -4),
    },
    {
      id: nid(),
      userId: dutyId,
      role: "reception",
      title: "Khách đang check-in",
      body: "Nguyễn Thu Hà — P.105, phòng INS sẵn sàng",
      link: "/reception/s-201",
      read: false,
      createdAt: addMinutes(now, -3),
    },
  ]);
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
