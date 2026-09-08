import { eq, inArray } from "drizzle-orm";
import { DEMO_PASSWORD } from "../constants";
import { addMinutes, currentShiftType, nid, nowISO, todayVN } from "../datetime";
import { hashPassword } from "../password";
import { shiftChecklistTemplate } from "../checklists";
import type { AppDb } from "./index";
import * as t from "./schema";
import type { DepartmentCode, ShiftType } from "../types";
import { insertInBatches } from "./batch";
import { ROOM_REMAP, ROOM_SEED, ROOM_TYPE_SEED, floorOf, roomIdOf } from "../rooms-catalog";
import { DEFAULT_WEEK_DUTY, ROSTER_SHIFTS, weekSlotId } from "../roster";
import { WEEKDAYS } from "../datetime";

export const STAFF_SEED = [
  { id: "u-ngan", username: "ngan", fullName: "Ngân Lễ tân ca sáng", role: "reception", departmentId: "d-reception", phone: "+84901111001" },
  { id: "u-thu", username: "thu", fullName: "Thu Lễ tân ca chiều", role: "reception", departmentId: "d-reception", phone: "+84901111002" },
  { id: "u-tuyen", username: "tuyen", fullName: "Tuyến Lễ tân ca tối", role: "reception", departmentId: "d-reception", phone: "+84901111003" },
  { id: "u-uyen", username: "uyen", fullName: "Uyên HK", role: "hk", departmentId: "d-hk", phone: "+84901111004" },
  { id: "u-thuy", username: "thuy", fullName: "Thuỷ HK", role: "hk", departmentId: "d-hk", phone: "+84901111005" },
  { id: "u-oanh", username: "oanh", fullName: "Oanh Bếp", role: "kitchen", departmentId: "d-kitchen", phone: "+84901111006" },
  { id: "u-quanly", username: "quanly", fullName: "Minh Quản lý", role: "manager", departmentId: "d-mgmt", phone: "+84901111007" },
] as const;

export const RETIRED_USERNAMES = ["letan", "hk", "bep", "tapvu", "ketoan"] as const;

export async function seedIfEmpty(db: AppDb) {
  const existing = await db.select({ id: t.rooms.id }).from(t.rooms).limit(1);
  if (!existing.length) await seed(db);
  await syncStaffUsers(db);
  await syncRoomCatalog(db);
  await syncReceptionRoster(db);
}

export async function seed(db: AppDb) {
  const now = nowISO();
  const today = todayVN();
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
      STAFF_SEED.map((p) => ({
        ...p,
        passwordHash: hash,
        active: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const demoOps: Record<string, { ops: string; hk: string }> = {
    "102": { ops: "occupied", hk: "ins" },
    "103": { ops: "vacant_dirty", hk: "waiting" },
    "105": { ops: "vacant_clean", hk: "ins" },
    "202": { ops: "occupied", hk: "ins" },
    "203": { ops: "cleaning", hk: "cleaning" },
    "204": { ops: "waiting_inspect", hk: "waiting_inspect" },
    "304": { ops: "vacant_dirty", hk: "waiting" },
    "305": { ops: "occupied", hk: "ins" },
  };

  await insertInBatches(
    (rows) => db.insert(t.rooms).values(rows),
    ROOM_SEED.map(({ number, type }) => {
      const demo = demoOps[number];
      return {
        id: roomIdOf(number),
        number,
        floor: floorOf(number),
        type,
        opsStatus: demo?.ops ?? "vacant_clean",
        hkStatus: demo?.hk ?? "ins",
        assignedTo: ["103", "203", "204", "304"].includes(number) ? "u-uyen" : null,
        oooReason: null,
        oooApproved: false,
        notes: null,
        updatedAt: now,
        updatedBy: "u-uyen",
      };
    }),
    5,
  );

  const checkinAt = addMinutes(now, -21);
  const stays = [
    {
      id: "s-305",
      pmsCode: "EZ-88421",
      roomId: "r-305",
      guestName: "Trần Minh Khoa",
      guestPhone: "0912345678",
      status: "inhouse",
      arrivalDate: today,
      departureDate: addDays(today, 2),
      adults: 2,
      children: 0,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      checkinAt,
      registrationDueAt: addMinutes(checkinAt, 30),
      registrationDoneAt: null,
      notes: "Khách VIP, cần nước suối thêm",
    },
    {
      id: "s-202",
      pmsCode: "EZ-88310",
      roomId: "r-202",
      guestName: "Lê Thị Hạnh",
      guestPhone: "0987654321",
      status: "inhouse",
      arrivalDate: addDays(today, -1),
      departureDate: addDays(today, 1),
      adults: 1,
      children: 1,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      checkinAt: addMinutes(now, -800),
      registrationDueAt: addMinutes(now, -770),
      registrationDoneAt: addMinutes(now, -780),
      notes: null,
    },
    {
      id: "s-102",
      pmsCode: "EZ-88201",
      roomId: "r-102",
      guestName: "Phạm Đức Anh",
      guestPhone: "0908888777",
      status: "departing",
      arrivalDate: addDays(today, -2),
      departureDate: today,
      adults: 2,
      children: 0,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: true,
      pmsCheckoutOk: false,
      invoiceOk: false,
      checkinAt: addMinutes(now, -3000),
      registrationDueAt: addMinutes(now, -2970),
      registrationDoneAt: addMinutes(now, -2980),
      notes: "Checkout 12:00, còn thiếu hóa đơn",
    },
    {
      id: "s-201",
      pmsCode: "EZ-88502",
      roomId: "r-105",
      guestName: "Nguyễn Thu Hà",
      guestPhone: "0933333444",
      status: "arriving",
      arrivalDate: today,
      departureDate: addDays(today, 3),
      adults: 2,
      children: 1,
      breakfast: true,
      pmsBookingOk: true,
      pmsCheckinOk: false,
      pmsCheckoutOk: false,
      invoiceOk: false,
      notes: "Ăn chay, dị ứng hải sản",
    },
    {
      id: "s-late",
      pmsCode: "EZ-88590",
      roomId: "r-101",
      guestName: "Võ Nhật Nam",
      guestPhone: "0977000111",
      status: "no_show",
      arrivalDate: today,
      departureDate: addDays(today, 1),
      adults: 1,
      children: 0,
      breakfast: false,
      pmsBookingOk: true,
      pmsCheckinOk: false,
      pmsCheckoutOk: false,
      invoiceOk: false,
      notes: "ETA 16:00, chưa liên hệ được",
    },
  ];

  await db.insert(t.stays).values(
    stays.map((s) => ({
      ...s,
      paymentNote: null,
      registrationReason: null,
      createdAt: now,
      updatedAt: now,
      createdBy: "u-ngan",
      updatedBy: "u-ngan",
    })),
  );

  await db.insert(t.vehicles).values({
    id: nid(),
    stayId: "s-305",
    vehicleType: "Ô tô",
    plate: "51H-223.18",
    location: "Hầm B1-12",
    keyLocation: "Hộc lễ tân số 3",
    notes: null,
    createdAt: now,
  });

  const shiftType = currentShiftType();
  const prevType: ShiftType = shiftType === "afternoon" ? "morning" : shiftType === "night" ? "afternoon" : "night";
  const prevDate = shiftType === "morning" ? addDays(today, -1) : today;

  const prevShiftId = "shift-prev";
  const curShiftId = "shift-current";

  await db.insert(t.shifts).values([
    {
      id: prevShiftId,
      type: prevType,
      date: prevDate,
      status: "closed",
      openedAt: addMinutes(now, -480),
      openedBy: "u-ngan",
      closedAt: addMinutes(now, -20),
      closedBy: "u-ngan",
      closeReason: null,
    },
    {
      id: curShiftId,
      type: shiftType,
      date: today,
      status: "open",
      openedAt: addMinutes(now, -18),
      openedBy: "u-ngan",
      closedAt: null,
      closedBy: null,
      closeReason: null,
    },
  ]);

  const deptsForList: DepartmentCode[] = ["reception", "hk", "kitchen", "utility", "management"];
  for (const dept of deptsForList) {
    const cid = nid();
    await db.insert(t.checklists).values({
      id: cid,
      shiftId: curShiftId,
      departmentCode: dept,
      title: `Checklist ${dept} — ca hiện tại`,
    });
    const items = shiftChecklistTemplate(shiftType, dept);
    if (items.length) {
      await db.insert(t.checklistItems).values(
        items.map((item, i) => ({
          id: nid(),
          checklistId: cid,
          label: item.label,
          required: item.required,
          done: i === 0,
          doneBy: i === 0 ? "u-ngan" : null,
          doneAt: i === 0 ? now : null,
          skipReason: null,
          sortOrder: i,
        })),
      );
    }
  }

  const handoverId = "ho-prev";
  await db.insert(t.handovers).values({
    id: handoverId,
    fromShiftId: prevShiftId,
    toShiftType: shiftType,
    status: "submitted",
    createdBy: "u-ngan",
    createdAt: addMinutes(now, -20),
    acceptedBy: null,
    acceptedAt: null,
    notes: "Ca trước còn khách chưa đến và 1 phòng OOO chờ duyệt.",
  });
  await db.insert(t.handoverItems).values([
    { id: nid(), handoverId, category: "Khách chưa đến", refType: "stay", refId: "s-late", summary: "EZ-88590 Võ Nhật Nam — P.101, ETA 16:00", note: null },
    { id: nid(), handoverId, category: "Phòng bẩn chờ dọn", refType: "room", refId: "r-304", summary: "P.304 FAMILY — vacant dirty, đã giao HK", note: null },
    { id: nid(), handoverId, category: "Khách gửi xe", refType: "vehicle", refId: "s-305", summary: "P.305 Ô tô 51H-223.18, chìa hộc 3", note: null },
  ]);

  const taskDue = addMinutes(now, 90);
  const taskId = "task-305-towels";
  await db.insert(t.tasks).values({
    id: taskId,
    fromDept: "reception",
    toDept: "hk",
    roomId: "r-305",
    area: null,
    content: "Cần 2 khăn tắm thêm",
    priority: "priority",
    assigneeId: "u-uyen",
    dueAt: taskDue,
    formCode: "BM-13",
    status: "new",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: null,
    zaloSent: false,
    zaloSentAt: null,
    photo: null,
    createdBy: "u-ngan",
    createdAt: addMinutes(now, -12),
    updatedBy: "u-ngan",
    updatedAt: addMinutes(now, -12),
  });
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId,
    fromStatus: null,
    toStatus: "new",
    actorId: "u-ngan",
    note: "Tạo việc từ yêu cầu khách",
    createdAt: addMinutes(now, -12),
  });

  await db.insert(t.tasks).values({
    id: "task-overdue",
    fromDept: "reception",
    toDept: "utility",
    roomId: null,
    area: "Sảnh",
    content: "Lau vết nước sảnh chính",
    priority: "urgent",
    assigneeId: null,
    dueAt: addMinutes(now, -40),
    formCode: "BM-13",
    status: "in_progress",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: null,
    zaloSent: true,
    zaloSentAt: addMinutes(now, -50),
    photo: null,
    createdBy: "u-ngan",
    createdAt: addMinutes(now, -80),
    updatedBy: "u-ngan",
    updatedAt: addMinutes(now, -50),
  });

  await db.insert(t.guestRequests).values([
    {
      id: nid(),
      stayId: "s-305",
      roomId: "r-305",
      kind: "extra",
      content: "2 khăn tắm",
      quantity: 2,
      dueAt: taskDue,
      assigneeId: "u-uyen",
      status: "open",
      createdBy: "u-ngan",
      createdAt: addMinutes(now, -12),
      updatedAt: addMinutes(now, -12),
    },
    {
      id: nid(),
      stayId: "s-202",
      roomId: "r-202",
      kind: "wake",
      content: "Báo thức 05:30",
      quantity: 1,
      dueAt: `${addDays(today, 1)}T05:30:00+07:00`,
      assigneeId: "u-ngan",
      status: "open",
      createdBy: "u-ngan",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nid(),
      stayId: "s-201",
      roomId: "r-105",
      kind: "early_breakfast",
      content: "Ăn sáng sớm 06:00, ăn chay, dị ứng hải sản",
      quantity: 3,
      dueAt: `${addDays(today, 1)}T06:00:00+07:00`,
      assigneeId: "u-oanh",
      status: "open",
      createdBy: "u-ngan",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(t.breakfasts).values({
    id: nid(),
    date: addDays(today, 1),
    adults: 18,
    children: 3,
    vegetarian: 2,
    allergy: 1,
    early: 3,
    takeaway: 2,
    notes: "1 suất dị ứng hải sản — P.105",
    sentBy: "u-ngan",
    confirmedBy: null,
    confirmedAt: null,
    actualAdults: null,
    actualChildren: null,
    updatedAt: now,
  });

  await db.insert(t.incidents).values({
    id: nid(),
    type: "facility",
    location: "Hành lang tầng 3",
    roomId: null,
    description: "Đèn hành lang tầng 3 chập chờn, đã ghi nhận chờ kỹ thuật",
    severity: "medium",
    status: "pending",
    photo: null,
    reportedBy: "u-uyen",
    approvedBy: null,
    createdAt: addMinutes(now, -90),
    updatedAt: addMinutes(now, -90),
  });

  await db.insert(t.notifications).values([
    {
      id: nid(),
      userId: "u-uyen",
      role: "hk",
      title: "Việc mới P.305",
      body: "Lễ tân giao 2 khăn tắm, ưu tiên",
      link: "/tasks/task-305-towels",
      read: false,
      createdAt: addMinutes(now, -12),
    },
    {
      id: nid(),
      userId: "u-ngan",
      role: "reception",
      title: "Bàn giao ca trước chờ nhận",
      body: "Ca trước đã gửi bàn giao. Bấm Đã nhận để xác nhận.",
      link: "/handover",
      read: false,
      createdAt: addMinutes(now, -18),
    },
    {
      id: nid(),
      userId: "u-quanly",
      role: "manager",
      title: "Đèn hành lang tầng 3",
      body: "HK báo đèn chập chờn, cần kỹ thuật kiểm tra",
      link: "/incidents",
      read: false,
      createdAt: addMinutes(now, -90),
    },
  ]);
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export async function syncReceptionRoster(db: AppDb) {
  const existing = await db.select({ id: t.receptionWeekSlots.id }).from(t.receptionWeekSlots).limit(1);
  if (existing.length) return;
  const users = await db.select({ id: t.users.id }).from(t.users);
  const ids = new Set(users.map((row) => row.id));
  const rows = WEEKDAYS.flatMap((day) =>
    ROSTER_SHIFTS.filter((shift) => ids.has(DEFAULT_WEEK_DUTY[shift])).map((shift) => ({
      id: weekSlotId(day.iso, shift),
      weekday: day.iso,
      shiftType: shift,
      userId: DEFAULT_WEEK_DUTY[shift],
    })),
  );
  if (rows.length) await db.insert(t.receptionWeekSlots).values(rows);
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

async function remapRoomRefs(db: AppDb, fromId: string, toId: string | null) {
  await db.update(t.stays).set({ roomId: toId }).where(eq(t.stays.roomId, fromId));
  await db.update(t.tasks).set({ roomId: toId }).where(eq(t.tasks.roomId, fromId));
  await db.update(t.guestRequests).set({ roomId: toId }).where(eq(t.guestRequests.roomId, fromId));
  await db.update(t.formSubmissions).set({ roomId: toId }).where(eq(t.formSubmissions.roomId, fromId));
  await db.update(t.incidents).set({ roomId: toId }).where(eq(t.incidents.roomId, fromId));
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
    await db
      .update(t.users)
      .set({
        username: person.username,
        fullName: person.fullName,
        role: person.role,
        departmentId: person.departmentId,
        phone: person.phone,
        active: true,
        updatedAt: now,
        ...(opts?.resetPasswords ? { passwordHash: hash } : {}),
      })
      .where(eq(t.users.id, found.id));
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
