import { eq } from "drizzle-orm";
import { ensureShiftChecklists, ensureTodayRoomTasks } from "@/lib/checklist-ops";
import { addDaysVN, addMinutes, nid } from "@/lib/datetime";
import type { AppDb } from "../index";
import * as t from "../schema";
import { isLocalOpsSeed, LOCAL_WEEK_DUTY } from "./data";
import type { DemoCtx } from "./demo-ctx";

export async function seedDemoOps(db: AppDb, ctx: DemoCtx) {
  const { now, today, shiftType, dutyId } = ctx;
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

    await ensureTodayRoomTasks(db, { actorId: dutyId, assigneeId: LOCAL_WEEK_DUTY.morning });
  
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
  
    const notifs: (typeof t.notifications.$inferInsert)[] = [
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
    ];
    if (isLocalOpsSeed()) {
      notifs.push(
        {
          id: nid(),
          userId: null,
          role: "manager",
          title: "Đặt phòng · Đặng Minh Tuấn",
          body: "Tuyến Lễ tân ca tối · P.401",
          link: "/sales/bookings/sale-401",
          read: false,
          createdAt: addMinutes(now, -12),
        },
        {
          id: nid(),
          userId: "u-tuyen",
          role: null,
          title: "Đặt phòng · Đặng Minh Tuấn",
          body: "Tuyến Lễ tân ca tối · P.401",
          link: "/sales/bookings/sale-401",
          read: false,
          createdAt: addMinutes(now, -12),
        },
        {
          id: nid(),
          userId: null,
          role: "manager",
          title: "Đặt phòng · Mai Thanh Hà",
          body: "Ngân Lễ tân ca sáng · P.508",
          link: "/sales/bookings/sale-508",
          read: false,
          createdAt: addMinutes(now, -9),
        },
        {
          id: nid(),
          userId: "u-ngan",
          role: null,
          title: "Đặt phòng · Mai Thanh Hà",
          body: "Ngân Lễ tân ca sáng · P.508",
          link: "/sales/bookings/sale-508",
          read: false,
          createdAt: addMinutes(now, -9),
        },
        {
          id: nid(),
          userId: null,
          role: "manager",
          title: "Sửa booking · Công ty An Phú",
          body: "Minh Quản lý · 1 phòng",
          link: "/sales/bookings/sale-506",
          read: false,
          createdAt: addMinutes(now, -5),
        },
      );
    }
    await db.insert(t.notifications).values(notifs);
}
