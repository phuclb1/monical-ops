import type { DepartmentCode, Role, TaskPriority } from "./types";

export const TASK_KINDS = [
  "towels",
  "housekeeping",
  "checkout_clean",
  "wake",
  "pickup",
  "registration",
  "invoice",
  "vehicle",
  "inspect",
  "lost_found",
  "public_area",
  "complaint",
  "ooo",
  "follow_up",
  "shift_open",
  "shift_close",
  "checkin",
  "checkout",
  "general",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export type TaskType = {
  kind: TaskKind;
  label: string;
  hint: string;
  owner: "reception" | "hk" | "manager" | "shared";
  toDept: DepartmentCode | null;
  priority: TaskPriority;
  room: "required" | "optional" | "none";
  group: "room" | "general";
  due: "shift_end" | "custom" | "none";
  canCreate: Role[];
  placeholder: string;
};

export const TASK_TYPES: TaskType[] = [
  {
    kind: "towels",
    label: "Thay khăn / đồ vải",
    hint: "Khăn tắm, khăn mặt, ga — giao HK",
    owner: "reception",
    toDept: "hk",
    priority: "normal",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "hk", "manager"],
    placeholder: "2 khăn tắm",
  },
  {
    kind: "housekeeping",
    label: "Dọn phòng khách ở",
    hint: "Dọn giữa ngày, dọn đồ",
    owner: "reception",
    toDept: "hk",
    priority: "normal",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "hk", "manager"],
    placeholder: "Dọn đồ 14:00",
  },
  {
    kind: "checkout_clean",
    label: "Dọn phòng trả",
    hint: "Khách đi, cần INS trước khách mới",
    owner: "hk",
    toDept: "hk",
    priority: "priority",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "hk", "manager"],
    placeholder: "Checkout 12:00, ưu tiên INS",
  },
  {
    kind: "wake",
    label: "Báo thức",
    hint: "Lễ tân gọi khách đúng giờ",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "required",
    group: "room",
    due: "custom",
    canCreate: ["reception", "manager"],
    placeholder: "Báo thức 05:30",
  },
  {
    kind: "pickup",
    label: "Xe đón / đưa",
    hint: "Giờ xe, điểm đón",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "optional",
    group: "room",
    due: "custom",
    canCreate: ["reception", "manager"],
    placeholder: "Xe sân bay 08:00",
  },
  {
    kind: "registration",
    label: "Đăng ký lưu trú",
    hint: "Còn hạn 30 phút hoặc quá hạn",
    owner: "reception",
    toDept: "reception",
    priority: "urgent",
    room: "required",
    group: "room",
    due: "custom",
    canCreate: ["reception", "manager"],
    placeholder: "Chưa xong CCCD",
  },
  {
    kind: "invoice",
    label: "Hóa đơn / checkout PMS",
    hint: "Đối chiếu ezCloudhotel",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "manager"],
    placeholder: "Thiếu hóa đơn VAT",
  },
  {
    kind: "vehicle",
    label: "Xe / chìa khách",
    hint: "Biển số, vị trí gửi, chìa",
    owner: "reception",
    toDept: "reception",
    priority: "normal",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "manager"],
    placeholder: "51H-… chìa hộc 3",
  },
  {
    kind: "inspect",
    label: "Kiểm INS",
    hint: "Checklist phòng sạch BM-06",
    owner: "hk",
    toDept: "hk",
    priority: "priority",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["hk", "reception", "manager"],
    placeholder: "Chờ kiểm P.304",
  },
  {
    kind: "lost_found",
    label: "Đồ thất lạc",
    hint: "Khách để lại / tìm đồ",
    owner: "hk",
    toDept: "hk",
    priority: "priority",
    room: "required",
    group: "room",
    due: "shift_end",
    canCreate: ["hk", "reception", "manager"],
    placeholder: "Quên sạc trong tủ",
  },
  {
    kind: "public_area",
    label: "Khu vực chung",
    hint: "Sảnh, WC, hành lang — không gắn phòng",
    owner: "hk",
    toDept: "hk",
    priority: "normal",
    room: "none",
    group: "general",
    due: "shift_end",
    canCreate: ["hk", "reception", "manager"],
    placeholder: "Lau sảnh chính",
  },
  {
    kind: "complaint",
    label: "Phàn nàn khách",
    hint: "Quản lý theo dõi đến xong",
    owner: "manager",
    toDept: "management",
    priority: "urgent",
    room: "optional",
    group: "room",
    due: "shift_end",
    canCreate: ["reception", "hk", "manager"],
    placeholder: "Khách phàn nàn điều hòa",
  },
  {
    kind: "ooo",
    label: "Phòng OOO / sửa",
    hint: "Chờ quản lý duyệt",
    owner: "manager",
    toDept: "management",
    priority: "urgent",
    room: "required",
    group: "room",
    due: "none",
    canCreate: ["hk", "manager"],
    placeholder: "Hỏng nóng lạnh",
  },
  {
    kind: "follow_up",
    label: "Theo dõi việc trễ",
    hint: "Quản lý đôn việc tồn",
    owner: "manager",
    toDept: "management",
    priority: "priority",
    room: "optional",
    group: "general",
    due: "shift_end",
    canCreate: ["manager"],
    placeholder: "Đôn khăn P.305",
  },
  {
    kind: "shift_open",
    label: "Đầu ca",
    hint: "Checklist routine khi mở ca lễ tân",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "none",
    group: "general",
    due: "shift_end",
    canCreate: [],
    placeholder: "Đầu ca",
  },
  {
    kind: "shift_close",
    label: "Cuối ca",
    hint: "Checklist routine trước khi kết ca",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "none",
    group: "general",
    due: "shift_end",
    canCreate: [],
    placeholder: "Cuối ca",
  },
  {
    kind: "checkin",
    label: "Nhận phòng",
    hint: "Checklist nhận khách theo phòng — tự sinh ngày đến",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "required",
    group: "room",
    due: "none",
    canCreate: [],
    placeholder: "Nhận P.xxx",
  },
  {
    kind: "checkout",
    label: "Trả phòng",
    hint: "Checklist trả khách theo phòng — tự sinh ngày đi",
    owner: "reception",
    toDept: "reception",
    priority: "priority",
    room: "required",
    group: "room",
    due: "none",
    canCreate: [],
    placeholder: "Trả P.xxx",
  },
  {
    kind: "general",
    label: "Việc khác",
    hint: "Không khớp loại trên — chọn bộ phận nhận",
    owner: "shared",
    toDept: null,
    priority: "normal",
    room: "optional",
    group: "general",
    due: "shift_end",
    canCreate: ["reception", "hk", "manager"],
    placeholder: "Nội dung việc",
  },
];

export const STAY_TASK_KINDS: TaskKind[] = ["towels", "housekeeping", "wake", "pickup", "vehicle", "complaint"];

export function getTaskType(kind: string | null | undefined): TaskType {
  return TASK_TYPES.find((item) => item.kind === kind) ?? TASK_TYPES.find((item) => item.kind === "general")!;
}

export function taskTypeLabel(kind: string | null | undefined) {
  return getTaskType(kind).label;
}

export const CHECKLIST_TASK_KINDS: TaskKind[] = ["shift_open", "shift_close", "checkin", "checkout"];

export function isChecklistTaskKind(kind: string | null | undefined) {
  return CHECKLIST_TASK_KINDS.includes(kind as TaskKind);
}

export function taskTypesForRole(role: Role) {
  return TASK_TYPES.filter((item) => item.canCreate.includes(role));
}

export function taskTypesByOwner(role: Role) {
  const list = taskTypesForRole(role);
  return {
    reception: list.filter((item) => item.owner === "reception"),
    hk: list.filter((item) => item.owner === "hk"),
    manager: list.filter((item) => item.owner === "manager"),
    shared: list.filter((item) => item.owner === "shared"),
  };
}

export const TASK_BOARD = {
  new: ["new", "accepted"],
  doing: ["in_progress", "blocked"],
  done: ["done", "checked"],
  archive: ["archive"],
} as const;

export const TASK_BOARD_LABEL = {
  new: "Mới",
  doing: "Đang làm",
  done: "Xong",
  archive: "Lưu",
} as const;

export type TaskBoardColumn = keyof typeof TASK_BOARD;

export function taskBoardColumn(status: string): TaskBoardColumn {
  if ((TASK_BOARD.doing as readonly string[]).includes(status)) return "doing";
  if ((TASK_BOARD.done as readonly string[]).includes(status)) return "done";
  if ((TASK_BOARD.archive as readonly string[]).includes(status)) return "archive";
  return "new";
}

export function isOpenTaskStatus(status: string) {
  return !["done", "checked", "archive"].includes(status);
}
