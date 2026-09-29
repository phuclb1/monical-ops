import { formatDateLong, formatDateNumeric } from "@/lib/datetime";
import { formatVnd, isOtaDebt } from "@/lib/sales";

export const ZALO_BOT_NAME = "Trợ Lý Monical";

export const ZALO_CHANNEL_DEFS = [
  {
    key: "booking",
    label: "Nhóm booking",
    hint: "Gửi khi tạo booking.",
    fields: "{{ma}} {{khach}} {{phong}} {{hang}} {{nhan}} {{tra}} {{phaiThu}} {{hoaDon}} {{tao}}",
    template: "Đã tạo booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}",
  },
  {
    key: "reception",
    label: "Nhóm lễ tân",
    hint: "Hôm nay có bao nhiêu phòng check-in, rồi từng phòng: khách, mã booking, số phải thu.",
    fields: "{{checkin}} {{dsCheckin}}",
    template: "Hôm nay có {{checkin}} phòng check-in\n{{dsCheckin}}",
  },
  {
    key: "task",
    label: "Nhóm việc",
    hint: "Gửi từ trang việc.",
    fields: "{{noiDung}}",
    template: "{{noiDung}}",
  },
] as const;

export type ZaloChannelKey = (typeof ZALO_CHANNEL_DEFS)[number]["key"];

export type ZaloChannel = {
  key: ZaloChannelKey;
  groupId: string;
  groupName: string;
  template: string;
};

export function isZaloChannelKey(value: string): value is ZaloChannelKey {
  return ZALO_CHANNEL_DEFS.some((item) => item.key === value);
}

export function zaloChannelDef(key: ZaloChannelKey) {
  const def = ZALO_CHANNEL_DEFS.find((item) => item.key === key);
  if (!def) throw new Error("Không có loại thông báo này");
  return def;
}

export function normalizeZaloChannels(
  raw: unknown,
  legacy?: { groupId?: string; groupName?: string },
): ZaloChannel[] {
  const saved = Array.isArray(raw) ? raw : [];
  return ZALO_CHANNEL_DEFS.map((def) => {
    const hit = saved.find((item) => item && typeof item === "object" && (item as { key?: string }).key === def.key) as
      | Partial<ZaloChannel>
      | undefined;
    let groupId = typeof hit?.groupId === "string" && /^\d+$/.test(hit.groupId) ? hit.groupId : "";
    let groupName = typeof hit?.groupName === "string" ? hit.groupName.trim().slice(0, 120) : "";
    if (!saved.length && def.key === "task" && legacy?.groupId && /^\d+$/.test(legacy.groupId)) {
      groupId = legacy.groupId;
      groupName = legacy.groupName?.trim().slice(0, 120) || "";
    }
    const previousReception = "Hôm nay {{ngay}}\nCheck-in: {{checkin}} phòng\nPhải thu: {{phaiThu}}\nCheck-out: {{checkout}} phòng";
    const custom = typeof hit?.template === "string" ? hit.template.trim() : "";
    const template = custom && !(def.key === "reception" && custom === previousReception) ? custom.slice(0, 2000) : def.template;
    return { key: def.key, groupId, groupName, template };
  });
}

export function renderZaloTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function zaloOutbound(body: string) {
  let text = body.trim();
  const prefix = `${ZALO_BOT_NAME}\n`;
  while (text === ZALO_BOT_NAME || text.startsWith(prefix)) {
    text = text === ZALO_BOT_NAME ? "" : text.slice(prefix.length).trim();
  }
  return text;
}

export function prettyRoomType(type?: string | null) {
  const name = (type || "").trim();
  if (!name || name === "—") return "";
  return name
    .split(/\s+/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "vip") return "VIP";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function zaloRoomCategories(rooms: { room?: { number?: string | null; type?: string | null } | null }[]) {
  const seen: string[] = [];
  const ordered = [...rooms].sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || "", "vi"));
  for (const row of ordered) {
    const label = prettyRoomType(row.room?.type);
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen.join(" · ") || "—";
}

export function bookingZaloVars(input: {
  code: string;
  guest: string;
  rooms: string;
  hang: string;
  invoice: boolean;
  createdBy: string;
  editedBy: string;
  edited: string;
  checkIn: string;
  checkOut: string;
  due: number;
}) {
  return {
    ma: input.code,
    khach: input.guest,
    phong: input.rooms,
    hang: input.hang || "—",
    nhan: formatDateNumeric(input.checkIn),
    tra: formatDateNumeric(input.checkOut),
    phaiThu: formatVnd(input.due),
    hoaDon: input.invoice ? "Có" : "Không",
    tao: input.createdBy || "—",
    sua: input.editedBy || "—",
    suaGi: input.edited || "Không thấy mục sửa trong nhật ký.",
  };
}

export function bookingEditSummary(
  changes: { key: string; label: string; before: string; after: string; kind: "add" | "remove" | "change" }[],
  rooms: Record<string, string> = {},
) {
  const lines = changes.map((change) => {
    const before = change.key === "roomId" ? roomNumber(change.before, rooms) : change.before;
    const after = change.key === "roomId" ? roomNumber(change.after, rooms) : change.after;
    if (change.kind === "add") return `${change.label}: ${after}`;
    if (change.kind === "remove") return `${change.label}: xóa ${before}`;
    return `${change.label}: ${before} → ${after}`;
  });
  return lines.join("\n");
}

function roomNumber(value: string, rooms: Record<string, string>) {
  if (!value || value === "—") return value || "—";
  return rooms[value] ? `P.${rooms[value]}` : value;
}

type DigestRoom = {
  status: string;
  checkIn: string;
  checkOut: string;
  room?: { number?: string | null; type?: string | null } | null;
};
type DigestBooking = {
  id: string;
  guestName: string;
  pmsCode?: string | null;
  due: number;
  source: string;
  otaPaymentMode?: string | null;
  rooms: DigestRoom[];
};

export function receptionDigest(bookings: DigestBooking[], date: string) {
  const lines: { room: string; text: string }[] = [];
  let checkin = 0;
  let checkout = 0;
  let due = 0;
  for (const booking of bookings) {
    const arriving = booking.rooms.filter((row) => (row.status === "reserved" || row.status === "inhouse") && row.checkIn === date);
    const leaving = booking.rooms.filter((row) => (row.status === "inhouse" || row.status === "departed") && row.checkOut === date);
    checkin += arriving.length;
    checkout += leaving.length;
    if (!arriving.length) continue;
    const amount = Math.max(0, Math.round(booking.due || 0));
    if (!isOtaDebt(booking.source, booking.otaPaymentMode)) due += amount;
    const rooms = [...arriving]
      .sort((a, b) => (a.room?.number || "").localeCompare(b.room?.number || "", "vi"))
      .map((row) => {
        const number = row.room?.number || "—";
        const type = prettyRoomType(row.room?.type);
        return type ? `P.${number} ${type}` : `P.${number}`;
      })
      .join(", ");
    const code = booking.pmsCode?.trim() || booking.id;
    const money = isOtaDebt(booking.source, booking.otaPaymentMode)
      ? `công nợ OTA ${formatVnd(amount)}`
      : amount > 0
        ? `phải thu ${formatVnd(amount)}`
        : "đã thu đủ";
    lines.push({ room: rooms, text: `${rooms} - ${booking.guestName} - ${code} - ${money}` });
  }
  lines.sort((a, b) => a.room.localeCompare(b.room, "vi"));
  return { checkin, checkout, due, dsCheckin: lines.map((line) => line.text).join("\n") || "Không có phòng check-in." };
}

export function receptionZaloVars(stats: { checkin: number; checkout: number; due: number; dsCheckin: string }, date: string) {
  return {
    ngay: formatDateLong(date),
    checkin: String(stats.checkin),
    checkout: String(stats.checkout),
    phaiThu: formatVnd(stats.due),
    dsCheckin: stats.dsCheckin,
  };
}

export function breakfastZaloVars(day: {
  rooms: number;
  adults: number;
  children: number;
  servings: number;
  rows: {
    roomNumber: string;
    roomType: string;
    guestName: string;
    adults: number;
    children: number;
    kind: "checked_in" | "expected";
  }[];
}) {
  const lines = day.rows.map((row) => {
    const type = prettyRoomType(row.roomType);
    const room = type ? `P.${row.roomNumber} ${type}` : `P.${row.roomNumber}`;
    const pax = [row.adults ? `${row.adults} NL` : "", row.children ? `${row.children} TE` : ""].filter(Boolean).join(" + ") || "0 suất";
    const state = row.kind === "checked_in" ? "đã nhận" : "dự kiến";
    return `${room} - ${row.guestName} - ${pax} - ${state}`;
  });
  return {
    suat: String(day.servings),
    nl: String(day.adults),
    te: String(day.children),
    phong: String(day.rooms),
    dsAnSang: lines.join("\n") || "Không có suất ăn sáng.",
  };
}
