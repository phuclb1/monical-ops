import type { ShiftType } from "./types";

export const CHECKLIST_KINDS = ["shift_open", "shift_close", "checkin", "checkout"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export type ChecklistTemplateItem = { key: string; label: string; required: boolean };

const R = (key: string, label: string, required = true): ChecklistTemplateItem => ({ key, label, required });

export const CHECKLIST_KIND_LABEL: Record<ChecklistKind, string> = {
  shift_open: "Đầu ca",
  shift_close: "Cuối ca",
  checkin: "Nhận phòng",
  checkout: "Trả phòng",
};

export function isChecklistKind(value: string | null | undefined): value is ChecklistKind {
  return CHECKLIST_KINDS.includes(value as ChecklistKind);
}

export function shiftOpenTemplate(type: ShiftType): ChecklistTemplateItem[] {
  if (type === "morning") {
    return [
      R("fund", "Kiểm quỹ đầu ca"),
      R("keys", "Kiểm chìa / thẻ phòng / chìa xe khách"),
      R("arrivals", "Xem khách đến / đi hôm nay"),
      R("handover", "Nhận bàn giao ca trước"),
    ];
  }
  if (type === "afternoon") {
    return [
      R("handover", "Nhận bàn giao ca sáng"),
      R("arrivals", "Xem khách đến chiều / việc nhận-trả còn dở"),
      R("keys", "Kiểm chìa / thẻ / quỹ"),
      R("leftover", "Việc ca sáng để lại đã nắm"),
    ];
  }
  return [
    R("handover", "Nhận bàn giao ca chiều"),
    R("noshow", "Kiểm khách chưa đến / no-show"),
    R("keys", "An ninh sảnh và chìa khóa"),
    R("wake", "Xem báo thức / xe đón / ăn sáng sớm"),
  ];
}

export function shiftCloseTemplate(type: ShiftType): ChecklistTemplateItem[] {
  const base = [
    R("fund", "Đối chiếu quỹ cuối ca"),
    R("keys", "Chìa / thẻ đã đủ"),
    R("leftover", "Việc dở đã ghi bàn giao"),
  ];
  if (type === "afternoon") return [...base, R("breakfast", "Đã gửi số ăn sáng ngày mai")];
  return base;
}

export function checkinTemplate(): ChecklistTemplateItem[] {
  return [
    R("pms", "Check-in PMS"),
    R("key", "Đưa chìa / thẻ phòng"),
    R("registration", "Đăng ký lưu trú"),
    R("vehicle", "Gửi xe nếu có", false),
  ];
}

export function checkoutTemplate(): ChecklistTemplateItem[] {
  return [
    R("invoice", "Hóa đơn"),
    R("pms", "Check-out PMS"),
    R("key", "Thu chìa / thẻ"),
    R("vehicle", "Xe / chìa đã trả", false),
  ];
}

export function checklistTemplate(kind: ChecklistKind, shiftType?: ShiftType): ChecklistTemplateItem[] {
  if (kind === "shift_open") return shiftOpenTemplate(shiftType || "morning");
  if (kind === "shift_close") return shiftCloseTemplate(shiftType || "morning");
  if (kind === "checkin") return checkinTemplate();
  return checkoutTemplate();
}
