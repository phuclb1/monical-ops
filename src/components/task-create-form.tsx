"use client";

import { useMemo, useState } from "react";
import { createTaskAction } from "@/actions/ops";
import { TaskDeptAssignee } from "@/components/task-dept-assignee";
import { Btn, Field } from "@/components/ui";
import { getTaskType, taskTypesByOwner, type TaskKind } from "@/lib/task-types";
import type { DepartmentCode, Role } from "@/lib/types";

type Person = { id: string; fullName: string; departmentCode: string; active: boolean };
type Room = { id: string; number: string };

const OWNER_TITLE = {
  reception: "Lễ tân",
  hk: "Buồng phòng",
  manager: "Quản lý",
  shared: "Khác",
} as const;

export function TaskCreateForm({
  role,
  fromDept,
  rooms,
  users,
  onDutyId,
  defaultKind,
  defaultRoomId,
  defaultStayId,
}: {
  role: Role;
  fromDept: DepartmentCode;
  rooms: Room[];
  users: Person[];
  onDutyId?: string;
  defaultKind?: string;
  defaultRoomId?: string;
  defaultStayId?: string;
}) {
  const groups = useMemo(() => taskTypesByOwner(role), [role]);
  const [kind, setKind] = useState<TaskKind | "">((defaultKind as TaskKind) || "");
  const type = kind ? getTaskType(kind) : null;
  const toDept = (type?.toDept || fromDept) as DepartmentCode;

  return (
    <form action={createTaskAction} className="space-y-3">
      {defaultStayId ? <input type="hidden" name="stayId" value={defaultStayId} /> : null}
      {defaultStayId ? <input type="hidden" name="returnTo" value="stay" /> : null}
      <Field label="Loại việc">
        <select name="kind" required value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
          <option value="" disabled>
            Chọn loại việc
          </option>
          {(Object.keys(OWNER_TITLE) as Array<keyof typeof OWNER_TITLE>).map((owner) =>
            groups[owner].length ? (
              <optgroup key={owner} label={OWNER_TITLE[owner]}>
                {groups[owner].map((item) => (
                  <option key={item.kind} value={item.kind}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </Field>
      {type ? <p className="text-xs text-[#5c6665]">{type.hint}</p> : null}

      {type?.toDept ? (
        <>
          <input type="hidden" name="fromDept" value={fromDept} />
          <input type="hidden" name="toDept" value={type.toDept} />
        </>
      ) : (
        <TaskDeptAssignee fromDept={fromDept} defaultToDept={toDept} onDutyId={onDutyId} users={users} />
      )}
      {type?.toDept ? (
        <Field label="Người phụ trách">
          <select name="assigneeId" defaultValue={type.toDept === "reception" ? onDutyId || "" : ""}>
            <option value="">Chưa gán — {type.toDept === "hk" ? "HK" : type.toDept === "management" ? "quản lý" : "lễ tân"} nhận</option>
            {users
              .filter((u) => u.active && u.departmentCode === type.toDept)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
          </select>
        </Field>
      ) : null}

      {type?.room === "none" ? (
        <input type="hidden" name="roomId" value="" />
      ) : (
        <Field label={type?.room === "required" ? "Phòng (bắt buộc)" : "Phòng"}>
          <select name="roomId" defaultValue={defaultRoomId || ""} required={type?.room === "required"}>
            <option value="">{type?.group === "general" ? "Việc chung — không gắn phòng" : "Chọn phòng"}</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                P.{r.number}
              </option>
            ))}
          </select>
        </Field>
      )}

      {type?.group === "general" ? (
        <Field label="Khu vực">
          <input name="area" placeholder="Sảnh, WC, hành lang..." />
        </Field>
      ) : null}

      <Field label="Nội dung">
        <textarea name="content" required placeholder={type?.placeholder || "Nội dung việc"} />
      </Field>
      <Field label="Mức độ">
        <select name="priority" defaultValue={type?.priority || "normal"} key={type?.kind || "none"}>
          <option value="normal">Thường</option>
          <option value="priority">Ưu tiên</option>
          <option value="urgent">Khẩn</option>
        </select>
      </Field>
      {type?.due !== "none" ? (
        <Field label={type?.due === "custom" ? "Giờ hẹn" : "Hạn (trống = hết ca)"}>
          <input type="datetime-local" name="dueAt" />
        </Field>
      ) : null}
      <Btn type="submit" className="w-full">
        Tạo việc
      </Btn>
    </form>
  );
}
