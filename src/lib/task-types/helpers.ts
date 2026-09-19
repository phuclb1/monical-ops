import type { Role } from "../types";
import { TASK_TYPES, type TaskKind, type TaskType } from "./catalog";

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
