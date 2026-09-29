import { todayVN, TZ } from "@/lib/datetime";

export const ZALO_GROUP_SLOTS = [
  { slot: "reception", label: "Nhóm lễ tân" },
  { slot: "booking", label: "Nhóm booking" },
] as const;

export type ZaloGroupSlot = (typeof ZALO_GROUP_SLOTS)[number]["slot"];

export type ZaloGroupConfig = {
  slot: ZaloGroupSlot;
  groupId: string;
  groupName: string;
};

export const ZALO_MESSAGE_DEFS = [
  {
    id: "daily-reception",
    name: "Bản tin lễ tân",
    kind: "schedule" as const,
    group: "reception" as const,
    time: "07:00",
    fields: "{{checkin}} {{dsCheckin}}",
    template: "Hôm nay có {{checkin}} phòng check-in\n{{dsCheckin}}",
  },
  {
    id: "daily-breakfast",
    name: "Báo cáo ăn sáng",
    kind: "schedule" as const,
    group: "reception" as const,
    time: "05:00",
    fields: "{{suat}} {{nl}} {{te}} {{phong}} {{dsAnSang}}",
    template: "Ăn sáng hôm nay: {{suat}} suất ({{nl}} NL + {{te}} TE) · {{phong}} phòng\n{{dsAnSang}}",
  },
  {
    id: "booking-created",
    name: "Booking mới",
    kind: "trigger" as const,
    event: "booking_created" as const,
    group: "booking" as const,
    fields: "{{nguon}} {{ma}} {{khach}} {{phong}} {{hang}} {{nhan}} {{tra}} {{tongPhong}} {{chietKhau}} {{tongSauCk}} {{datCoc}} {{conPhaiThu}} {{hoaDon}} {{tao}}",
    template: "Booking mới từ nguồn {{nguon}} {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nTổng phòng: {{tongPhong}}\nChiết khấu: {{chietKhau}}\nTổng sau chiết khấu: {{tongSauCk}}\nĐặt cọc: {{datCoc}}\nCòn phải thu khi check-in: {{conPhaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}",
  },
  {
    id: "booking-updated",
    name: "Sửa booking",
    kind: "trigger" as const,
    event: "booking_updated" as const,
    group: "booking" as const,
    fields: "{{ma}} {{suaGi}}",
    template: "Sửa booking {{ma}}\n{{suaGi}}",
  },
] as const;

const PREVIOUS_MESSAGE_TEMPLATES: Record<string, string[]> = {
  "booking-created": [
    "Đã tạo booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}",
    "Đã tạo booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}",
    "Đã tạo booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}",
  ],
  "booking-updated": [
    "Đã sửa booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}",
    "Đã sửa booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}",
    "Đã sửa booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}\nNgười sửa: {{sua}}",
    "Đã sửa booking {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nPhải thu: {{phaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}\nNgười sửa: {{sua}}\nSửa:\n{{suaGi}}",
    "Sửa booking từ nguồn {{nguon}} {{ma}}\nKhách: {{khach}}\nPhòng: {{phong}}\nHạng: {{hang}}\nNhận {{nhan}} · trả {{tra}}\nTổng phòng: {{tongPhong}}\nChiết khấu: {{chietKhau}}\nTổng sau chiết khấu: {{tongSauCk}}\nĐặt cọc: {{datCoc}}\nCòn phải thu khi check-in: {{conPhaiThu}}\nXuất hóa đơn: {{hoaDon}}\nNgười tạo: {{tao}}\nNgười sửa: {{sua}}\nSửa:\n{{suaGi}}",
  ],
};

export type ZaloMessageEvent = "booking_created" | "booking_updated";

export type ZaloMessage = {
  id: string;
  name: string;
  enabled: boolean;
  group: ZaloGroupSlot;
  template: string;
  kind: "schedule" | "trigger";
  time: string;
  event: ZaloMessageEvent | "";
  lastSentOn: string;
};

type LegacyChannel = { key?: string; groupId?: string; groupName?: string; template?: string };

export function isZaloGroupSlot(value: string): value is ZaloGroupSlot {
  return ZALO_GROUP_SLOTS.some((item) => item.slot === value);
}

export function isZaloMessageId(value: string) {
  return ZALO_MESSAGE_DEFS.some((item) => item.id === value);
}

export function isZaloTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function clockVN(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  let hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  if (hour === "24") hour = "00";
  return `${hour}:${minute}`;
}

export function minutesOfDay(hhmm: string) {
  const [hour, minute] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function scheduleIsDue(message: Pick<ZaloMessage, "enabled" | "kind" | "time" | "lastSentOn">, now = new Date()) {
  if (!message.enabled || message.kind !== "schedule" || !isZaloTime(message.time)) return false;
  if (message.lastSentOn === todayVN(now)) return false;
  const target = minutesOfDay(message.time);
  const current = minutesOfDay(clockVN(now));
  if (target === null || current === null) return false;
  return current >= target && current < target + 20;
}

export function normalizeZaloGroups(raw: unknown, legacy: LegacyChannel[] = []): ZaloGroupConfig[] {
  const saved = Array.isArray(raw) ? raw : [];
  return ZALO_GROUP_SLOTS.map((def) => {
    const hit = saved.find((item) => item && typeof item === "object" && (item as { slot?: string }).slot === def.slot) as
      | Partial<ZaloGroupConfig>
      | undefined;
    const fromChannel = legacy.find((item) => item.key === def.slot);
    const groupId = groupIdOf(hit?.groupId) || groupIdOf(fromChannel?.groupId);
    const groupName = nameOf(hit?.groupName) || (groupId && groupId === groupIdOf(fromChannel?.groupId) ? nameOf(fromChannel?.groupName) : "");
    return { slot: def.slot, groupId, groupName };
  });
}

export function normalizeZaloMessages(raw: unknown, legacy: LegacyChannel[] = []): ZaloMessage[] {
  const saved = Array.isArray(raw) ? raw : [];
  return ZALO_MESSAGE_DEFS.map((def) => {
    const hit = saved.find((item) => item && typeof item === "object" && (item as { id?: string }).id === def.id) as
      | Partial<ZaloMessage>
      | undefined;
    const legacyKey = def.id === "daily-reception" ? "reception" : def.id === "booking-created" ? "booking" : "";
    const fromChannel = legacy.find((item) => item.key === legacyKey);
    const custom = typeof hit?.template === "string" ? hit.template.trim() : "";
    const legacyTemplate = typeof fromChannel?.template === "string" ? fromChannel.template.trim() : "";
    const stale = PREVIOUS_MESSAGE_TEMPLATES[def.id] || [];
    const savedTemplate = custom && !stale.includes(custom) ? custom : "";
    const channelTemplate = legacyTemplate && !stale.includes(legacyTemplate) ? legacyTemplate : "";
    const kept = ensureActorLines(def.id, savedTemplate || channelTemplate || def.template);
    return {
      id: def.id,
      name: def.name,
      enabled: typeof hit?.enabled === "boolean" ? hit.enabled : true,
      group: isZaloGroupSlot(String(hit?.group || "")) ? (hit?.group as ZaloGroupSlot) : def.group,
      template: kept.slice(0, 2000),
      kind: def.kind,
      time: isZaloTime(String(hit?.time || "")) ? String(hit?.time) : "time" in def ? def.time : "07:00",
      event: def.kind === "trigger" ? def.event : "",
      lastSentOn: typeof hit?.lastSentOn === "string" ? hit.lastSentOn : "",
    };
  });
}

function ensureActorLines(id: string, template: string) {
  let text = template.trim();
  if (id === "booking-created" && !/\{\{\s*tao\s*\}\}/.test(text)) text = `${text}\nNgười tạo: {{tao}}`;
  if (id === "booking-updated") {
    if (!/\{\{\s*ma\s*\}\}/.test(text)) text = `Sửa booking {{ma}}\n${text}`;
    if (!/\{\{\s*suaGi\s*\}\}/.test(text)) text = `${text}\n{{suaGi}}`;
  }
  return text;
}

function groupIdOf(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? value : "";
}

function nameOf(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
