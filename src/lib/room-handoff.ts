import { isOpenTaskStatus } from "./task-types";

export const HK_STANDBY = "hk-standby";
export const HK_STAYOVER = "hk-stayover";
export const HK_CO_INSPECT = "hk-co-inspect";

export type HandoffPurpose = "standby" | "stayover" | "checkout_inspect";

export type HandoffTask = {
  id?: string;
  kind: string;
  formCode: string | null;
  status: string;
  content: string;
  roomId?: string | null;
};

export function isFinishedTask(status: string) {
  return status === "done" || status === "checked";
}

export function handoffSpec(purpose: HandoffPurpose, roomNumber: string, guestName: string) {
  if (purpose === "standby") {
    return {
      kind: "inspect" as const,
      formCode: HK_STANDBY,
      content: `Standby P.${roomNumber} — kiểm INS trước nhận ${guestName}`,
    };
  }
  if (purpose === "stayover") {
    return {
      kind: "housekeeping" as const,
      formCode: HK_STAYOVER,
      content: `Dọn phòng khách ở P.${roomNumber} — ${guestName}`,
    };
  }
  return {
    kind: "inspect" as const,
    formCode: HK_CO_INSPECT,
    content: `Kiểm phòng trả P.${roomNumber} — ${guestName}`,
  };
}

export function receptionKindAfterInspect(formCode: string | null | undefined, saleStatus?: string) {
  if (formCode === HK_STANDBY) return "checkin" as const;
  if (formCode === HK_CO_INSPECT) return "checkout" as const;
  if (saleStatus === "reserved") return "checkin" as const;
  if (saleStatus === "inhouse") return "checkout" as const;
  return null;
}

export function matchHandoff(task: HandoffTask, purpose: HandoffPurpose) {
  const spec = handoffSpec(purpose, "x", "x");
  return task.kind === spec.kind && (task.formCode === spec.formCode || (!task.formCode && purpose === "stayover" && task.kind === "housekeeping"));
}

export function openHandoff(tasks: HandoffTask[], purpose: HandoffPurpose) {
  return tasks.find((task) => matchHandoff(task, purpose) && isOpenTaskStatus(task.status));
}

export function doneHandoff(tasks: HandoffTask[], purpose: HandoffPurpose) {
  return tasks.find((task) => matchHandoff(task, purpose) && isFinishedTask(task.status));
}

export function canCheckinAfterStandby(tasks: HandoffTask[]) {
  return Boolean(doneHandoff(tasks, "standby"));
}

export function canCheckoutAfterInspect(tasks: HandoffTask[]) {
  return Boolean(doneHandoff(tasks, "checkout_inspect"));
}

export function handoffBlockReason(kind: "checkin" | "checkout", tasks: HandoffTask[]) {
  if (kind === "checkin") {
    if (openHandoff(tasks, "standby")) return "HK đang kiểm phòng standby";
    if (!canCheckinAfterStandby(tasks)) return "Chưa có HK xác nhận phòng standby";
    return null;
  }
  if (openHandoff(tasks, "checkout_inspect")) return "HK đang kiểm phòng trả";
  if (!canCheckoutAfterInspect(tasks)) return "Chưa có HK xác nhận kiểm phòng trả";
  return null;
}
