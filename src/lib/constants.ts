import type { DepartmentCode, DiscountKind, FormCode, HkStatus, Role, SaleOrigin, SaleSource, SaleStatus, ShiftType, StayStatus, TaskPriority, TaskStatus } from "./types";

export const HOTEL_NAME = process.env.NEXT_PUBLIC_HOTEL_NAME ?? "MONICAL hotel dalat";
export const HOTEL_LETTERHEAD = process.env.NEXT_PUBLIC_HOTEL_LETTERHEAD ?? "MONICAL Hotel Dalat";
export const HOTEL_ADDRESS =
  process.env.NEXT_PUBLIC_HOTEL_ADDRESS ?? "48 Phan Như Thạch, Phường Xuân Hương, Đà Lạt, Lâm Đồng";
export const HOTEL_EMAIL = process.env.NEXT_PUBLIC_HOTEL_EMAIL ?? "monicalhoteldalat.support@gmail.com";
export const HOTEL_PHONE = process.env.NEXT_PUBLIC_HOTEL_PHONE ?? "0976 775 768";
export const CHECK_IN_TIME = "14:00";
export const CHECK_OUT_TIME = "12:00";

export const ROLE_LABEL: Record<Role, string> = {
  reception: "Lễ tân",
  hk: "Buồng phòng",
  kitchen: "Bếp",
  utility: "Tạp vụ",
  manager: "Quản lý",
  accounting: "Kế toán",
};

export const ROLE_DEPT: Record<Role, DepartmentCode> = {
  reception: "reception",
  hk: "hk",
  kitchen: "kitchen",
  utility: "utility",
  manager: "management",
  accounting: "accounting",
};

export const DEPT_LABEL: Record<DepartmentCode, string> = {
  reception: "Lễ tân",
  hk: "Buồng phòng",
  kitchen: "Bếp",
  utility: "Tạp vụ",
  management: "Quản lý",
  accounting: "Kế toán",
};

export const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: "Ca sáng",
  afternoon: "Ca chiều",
  night: "Ca đêm",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: "Mới",
  accepted: "Đã nhận",
  in_progress: "Đang xử lý",
  done: "Hoàn tất",
  checked: "Đã kiểm tra",
  blocked: "Vướng",
  archive: "Lưu",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  normal: "Thường",
  priority: "Ưu tiên",
  urgent: "Khẩn",
};

export const HK_LABEL: Record<HkStatus, string> = {
  waiting: "Chờ nhận",
  accepted: "Đã nhận",
  cleaning: "Đang dọn",
  waiting_inspect: "Chờ kiểm",
  ins: "INS",
};

export const STAY_LABEL: Record<StayStatus, string> = {
  arriving: "Khách đến",
  inhouse: "Đang ở",
  departing: "Khách đi",
  departed: "Đã trả",
  no_show: "Chưa đến",
};

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  reserved: "Đã giữ",
  inhouse: "Đang ở",
  departed: "Đã trả",
  cancelled: "Hủy",
  no_show: "No-show",
};

export const SALE_ORIGIN_LABEL: Record<SaleOrigin, string> = {
  ops: "Tạo trên Ops",
  ezcloud: "Từ ezCloud",
};

export const SALE_SOURCE_LABEL: Record<SaleSource, string> = {
  walk_in: "Vãng lai",
  phone: "Điện thoại",
  zalo: "Zalo",
  facebook: "Facebook",
  company: "Công ty / đoàn",
  ezcloud: "ezCloud / web KS",
  booking: "Booking.com",
  agoda: "Agoda",
  traveloka: "Traveloka",
  expedia: "Expedia",
  airbnb: "Airbnb",
  ota: "OTA khác",
};

export const SALE_SOURCE_GROUPS: { label: string; values: SaleSource[] }[] = [
  { label: "Trực tiếp", values: ["walk_in", "phone", "zalo", "facebook", "company", "ezcloud"] },
  { label: "OTA", values: ["booking", "agoda", "traveloka", "expedia", "airbnb", "ota"] },
];

export const DISCOUNT_KIND_LABEL: Record<DiscountKind, string> = {
  none: "Không",
  percent: "%",
  amount: "Số tiền",
};

export const REQUEST_KIND_LABEL: Record<string, string> = {
  towels: "Thay khăn",
  housekeeping: "Dọn phòng / dọn đồ",
  extra: "Yêu cầu thêm",
  complaint: "Phàn nàn",
  wake: "Báo thức",
  pickup: "Xe đón",
  early_breakfast: "Ăn sáng sớm",
};

export const REQUEST_KINDS = [
  "towels",
  "housekeeping",
  "extra",
  "complaint",
  "wake",
  "pickup",
  "early_breakfast",
] as const;

export function requestKindLabel(kind: string) {
  return REQUEST_KIND_LABEL[kind] || kind;
}

export const FORM_CATALOG: { code: FormCode; name: string; p0: boolean }[] = [
  { code: "BM-01", name: "Bàn giao ca", p0: true },
  { code: "BM-02", name: "Kiểm quỹ và thanh toán", p0: false },
  { code: "BM-03", name: "Khách đến, đi và đăng ký lưu trú", p0: true },
  { code: "BM-04", name: "Yêu cầu / phàn nàn", p0: true },
  { code: "BM-05", name: "Phân công phòng HK", p0: true },
  { code: "BM-06", name: "Checklist phòng sạch", p0: true },
  { code: "BM-09", name: "Khách ăn sáng", p0: true },
  { code: "BM-10", name: "Mở / đóng bếp", p0: false },
  { code: "BM-13", name: "Phối hợp liên bộ phận", p0: true },
  { code: "BM-14", name: "Sự cố", p0: true },
  { code: "BM-15", name: "Báo cáo vận hành ngày", p0: true },
];

export const ROOM_CHECKLIST = [
  { key: "bed", label: "Giường thay ga, gối gọn", required: true },
  { key: "bath", label: "Nhà tắm sạch, không mùi", required: true },
  { key: "amenities", label: "Amenities đủ bộ", required: true },
  { key: "minibar", label: "Mini bar đã kiểm", required: false },
  { key: "trash", label: "Rác đã đổ", required: true },
  { key: "window", label: "Cửa sổ / rèm / ban công", required: true },
  { key: "devices", label: "Điều hòa, TV, đèn hoạt động", required: true },
  { key: "lost", label: "Không còn đồ thất lạc chưa báo", required: true },
];

export const DEMO_PASSWORD = "123456";
