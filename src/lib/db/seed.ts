import { eq } from "drizzle-orm";
import { DEMO_PASSWORD } from "../constants";
import { addMinutes, currentShiftType, nid, nowISO, todayVN } from "../datetime";
import { hashPassword } from "../password";
import { shiftChecklistTemplate } from "../checklists";
import type { AppDb } from "./index";
import * as t from "./schema";
import type { DepartmentCode, ShiftType } from "../types";
import { insertInBatches } from "./batch";

export async function seedIfEmpty(db: AppDb) {
  const existing = await db.select({ id: t.rooms.id }).from(t.rooms).limit(1);
  if (existing.length) return;
  await seed(db);
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

  const people = [
    { id: "u-letan", username: "letan", fullName: "Ngọc Lễ tân", role: "reception", departmentId: "d-reception", phone: "+84901111001" },
    { id: "u-hk", username: "hk", fullName: "Lan HK", role: "hk", departmentId: "d-hk", phone: "+84901111002" },
    { id: "u-bep", username: "bep", fullName: "Hùng Bếp", role: "kitchen", departmentId: "d-kitchen", phone: "+84901111003" },
    { id: "u-tapvu", username: "tapvu", fullName: "Mai Tạp vụ", role: "utility", departmentId: "d-utility", phone: "+84901111004" },
    { id: "u-quanly", username: "quanly", fullName: "Minh Quản lý", role: "manager", departmentId: "d-mgmt", phone: "+84901111005" },
    { id: "u-ketoan", username: "ketoan", fullName: "Hà Kế toán", role: "accounting", departmentId: "d-acc", phone: "+84901111006" },
  ];
  if (!hasUsers) {
    await db.insert(t.users).values(
      people.map((p) => ({
        ...p,
        passwordHash: hash,
        active: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const roomDefs = [
    ["101", 1, "vacant_clean", "ins"],
    ["102", 1, "occupied", "ins"],
    ["103", 1, "vacant_dirty", "waiting"],
    ["201", 2, "vacant_clean", "ins"],
    ["202", 2, "occupied", "ins"],
    ["203", 2, "cleaning", "cleaning"],
    ["204", 2, "waiting_inspect", "waiting_inspect"],
    ["301", 3, "ins", "ins"],
    ["302", 3, "occupied", "ins"],
    ["303", 3, "ooo", "waiting"],
    ["304", 3, "vacant_dirty", "waiting"],
    ["305", 3, "occupied", "ins"],
  ] as const;

  await insertInBatches(
    (rows) => db.insert(t.rooms).values(rows),
    roomDefs.map(([number, floor, ops, hk]) => ({
      id: `r-${number}`,
      number,
      floor,
      type: floor === 3 ? "Deluxe" : "Superior",
      opsStatus: ops,
      hkStatus: hk,
      assignedTo: ["103", "203", "204", "304"].includes(number) ? "u-hk" : null,
      oooReason: number === "303" ? "Rò nước trần nhà tắm" : null,
      oooApproved: false,
      notes: null,
      updatedAt: now,
      updatedBy: "u-hk",
    })),
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
      roomId: "r-201",
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
      createdBy: "u-letan",
      updatedBy: "u-letan",
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
      openedBy: "u-letan",
      closedAt: addMinutes(now, -20),
      closedBy: "u-letan",
      closeReason: null,
    },
    {
      id: curShiftId,
      type: shiftType,
      date: today,
      status: "open",
      openedAt: addMinutes(now, -18),
      openedBy: "u-letan",
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
          doneBy: i === 0 ? "u-letan" : null,
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
    createdBy: "u-letan",
    createdAt: addMinutes(now, -20),
    acceptedBy: null,
    acceptedAt: null,
    notes: "Ca trước còn khách chưa đến và 1 phòng OOO chờ duyệt.",
  });
  await db.insert(t.handoverItems).values([
    { id: nid(), handoverId, category: "Khách chưa đến", refType: "stay", refId: "s-late", summary: "EZ-88590 Võ Nhật Nam — P.101, ETA 16:00", note: null },
    { id: nid(), handoverId, category: "Phòng OOO", refType: "room", refId: "r-303", summary: "P.303 rò nước trần, chờ quản lý duyệt", note: null },
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
    assigneeId: "u-hk",
    dueAt: taskDue,
    formCode: "BM-13",
    status: "new",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: null,
    zaloSent: false,
    zaloSentAt: null,
    photo: null,
    createdBy: "u-letan",
    createdAt: addMinutes(now, -12),
    updatedBy: "u-letan",
    updatedAt: addMinutes(now, -12),
  });
  await db.insert(t.taskHistory).values({
    id: nid(),
    taskId,
    fromStatus: null,
    toStatus: "new",
    actorId: "u-letan",
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
    assigneeId: "u-tapvu",
    dueAt: addMinutes(now, -40),
    formCode: "BM-13",
    status: "in_progress",
    blockedReason: null,
    blockedAction: null,
    zaloMessage: null,
    zaloSent: true,
    zaloSentAt: addMinutes(now, -50),
    photo: null,
    createdBy: "u-letan",
    createdAt: addMinutes(now, -80),
    updatedBy: "u-tapvu",
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
      assigneeId: "u-hk",
      status: "open",
      createdBy: "u-letan",
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
      assigneeId: "u-letan",
      status: "open",
      createdBy: "u-letan",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nid(),
      stayId: "s-201",
      roomId: "r-201",
      kind: "early_breakfast",
      content: "Ăn sáng sớm 06:00, ăn chay, dị ứng hải sản",
      quantity: 3,
      dueAt: `${addDays(today, 1)}T06:00:00+07:00`,
      assigneeId: "u-bep",
      status: "open",
      createdBy: "u-letan",
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
    notes: "1 suất dị ứng hải sản — P.201",
    sentBy: "u-letan",
    confirmedBy: null,
    confirmedAt: null,
    actualAdults: null,
    actualChildren: null,
    updatedAt: now,
  });

  await db.insert(t.incidents).values({
    id: nid(),
    type: "facility",
    location: "P.303",
    roomId: "r-303",
    description: "Rò nước trần nhà tắm, đã cắt nguồn điện khu vực ướt",
    severity: "high",
    status: "pending",
    photo: null,
    reportedBy: "u-hk",
    approvedBy: null,
    createdAt: addMinutes(now, -90),
    updatedAt: addMinutes(now, -90),
  });

  await db.insert(t.notifications).values([
    {
      id: nid(),
      userId: "u-hk",
      role: "hk",
      title: "Việc mới P.305",
      body: "Lễ tân giao 2 khăn tắm, ưu tiên",
      link: "/tasks/task-305-towels",
      read: false,
      createdAt: addMinutes(now, -12),
    },
    {
      id: nid(),
      userId: "u-letan",
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
      title: "P.303 chờ duyệt OOO",
      body: "HK báo rò nước, cần duyệt ngừng bán phòng",
      link: "/rooms/r-303",
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

export async function userByUsername(db: AppDb, username: string) {
  const rows = await db.select().from(t.users).where(eq(t.users.username, username)).limit(1);
  return rows[0] ?? null;
}
