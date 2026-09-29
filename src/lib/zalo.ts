import { DEPT_LABEL, PRIORITY_LABEL } from "./constants";
import type { DepartmentCode, TaskPriority } from "./types";

export function buildZaloMessage(input: {
  room?: string | null;
  area?: string | null;
  priority: TaskPriority;
  content: string;
  dueAt?: string | null;
  assignee?: string | null;
  dept?: DepartmentCode | null;
  url: string;
}) {
  const loc = input.room ? `P.${input.room}` : input.area || "Khu vực chung";
  const due = input.dueAt
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(input.dueAt))
    : "sớm nhất";
  const who = input.assignee || (input.dept ? DEPT_LABEL[input.dept] : "bộ phận nhận");
  return `[PHÒNG][${PRIORITY_LABEL[input.priority].toUpperCase()}] ${loc} ${input.content} trước ${due}. Người xử lý: ${who}. Xem và xác nhận: ${input.url}`;
}

export function normalizeZaloPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("84") && digits.length >= 11) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

export function zaloPhoneError(raw: string) {
  if (!/^0\d{9}$/.test(normalizeZaloPhone(raw))) return "Số Zalo cần là số di động 10 chữ số.";
  return null;
}

export function zaloPhonesMatch(left: string, right: string) {
  const a = normalizeZaloPhone(left);
  const b = normalizeZaloPhone(right);
  return Boolean(a && b && a === b);
}

export function cookieDeadline(cookies: unknown) {
  return {
    encryptUntil: cookieExpiry(cookies, "zpw_sek"),
    loginUntil: cookieExpiry(cookies, "zpsid"),
  };
}

function cookieExpiry(cookies: unknown, name: string) {
  if (!Array.isArray(cookies)) return null;
  const cookie = cookies.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { key?: string; name?: string };
    return (record.key || record.name) === name;
  }) as { expires?: unknown; expirationDate?: unknown } | undefined;
  if (!cookie) return null;
  if (typeof cookie.expires === "string" && cookie.expires !== "Infinity") {
    const date = new Date(cookie.expires);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof cookie.expirationDate === "number" && Number.isFinite(cookie.expirationDate)) {
    return new Date(cookie.expirationDate * 1000).toISOString();
  }
  return null;
}
