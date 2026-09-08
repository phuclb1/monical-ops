"use client";

import { useMemo, useState } from "react";
import { Field } from "./ui";
import { DEPT_LABEL } from "@/lib/constants";
import type { DepartmentCode } from "@/lib/types";

type Person = {
  id: string;
  fullName: string;
  departmentCode: string;
  active: boolean;
};

export function TaskDeptAssignee({
  fromDept,
  defaultToDept = "hk",
  users,
}: {
  fromDept: DepartmentCode;
  defaultToDept?: DepartmentCode;
  users: Person[];
}) {
  const [toDept, setToDept] = useState<DepartmentCode>(defaultToDept);
  const assignees = useMemo(
    () => users.filter((u) => u.active && u.departmentCode === toDept),
    [users, toDept],
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Bộ phận giao">
          <select name="fromDept" defaultValue={fromDept}>
            {Object.entries(DEPT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bộ phận nhận">
          <select name="toDept" value={toDept} onChange={(e) => setToDept(e.target.value as DepartmentCode)}>
            {Object.entries(DEPT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Người phụ trách">
        <select name="assigneeId" defaultValue="" key={toDept}>
          <option value="">Chưa gán</option>
          {assignees.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        {assignees.length === 0 ? (
          <p className="mt-1 text-xs text-[#c47b12]">Chưa có nhân viên thuộc {DEPT_LABEL[toDept]}.</p>
        ) : (
          <p className="mt-1 text-xs text-[#6b7372]">Chỉ hiện người thuộc {DEPT_LABEL[toDept]}.</p>
        )}
      </Field>
    </>
  );
}
