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

export function zaloShareUrl(text: string) {
  return `https://zalo.me/share?t=${encodeURIComponent(text)}`;
}
