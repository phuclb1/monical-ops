import { notFound, redirect } from "next/navigation";
import { taskStatusAction } from "@/actions/ops";
import { ChecklistPanel } from "@/components/checklist-panel";
import { ZaloShare } from "@/components/zalo-button";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { DEPT_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { taskTypeLabel } from "@/lib/task-types";
import { formatDateTime } from "@/lib/datetime";
import { getTask } from "@/lib/repos";
import { buildZaloMessage } from "@/lib/zalo";
import type { DepartmentCode, TaskPriority, TaskStatus } from "@/lib/types";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;
  const data = await getTask(id);
  if (!data) notFound();
  const { task, history, users, room, checklist } = data;
  const assignee = users.find((u) => u.id === task.assigneeId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const message =
    task.zaloMessage ||
    buildZaloMessage({
      room: room?.number,
      area: task.area,
      priority: task.priority as TaskPriority,
      content: task.content,
      dueAt: task.dueAt,
      assignee: assignee?.fullName,
      dept: task.toDept as DepartmentCode,
      url: `${appUrl}/tasks/${task.id}`,
    });

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">{task.content}</h1>
      <div className="flex flex-wrap gap-1">
        <Chip tone="teal">{taskTypeLabel(task.kind)}</Chip>
        <Chip>{TASK_STATUS_LABEL[task.status as TaskStatus]}</Chip>
        <Chip tone={task.priority === "urgent" ? "danger" : task.priority === "priority" ? "warn" : "neutral"}>
          {PRIORITY_LABEL[task.priority as TaskPriority]}
        </Chip>
        <Chip>
          {DEPT_LABEL[task.fromDept as DepartmentCode]} → {DEPT_LABEL[task.toDept as DepartmentCode]}
        </Chip>
        {room ? <Chip tone="teal">P.{room.number}</Chip> : null}
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      {checklist ? (
        <ChecklistPanel list={checklist} hint="Cùng checklist trên thẻ khách / ca. Note và ảnh tuỳ chọn." />
      ) : null}

      <Card>
        <p className="text-sm">Phụ trách: {assignee?.fullName || "Chưa gán"}</p>
        <p className="text-sm">Hạn: {formatDateTime(task.dueAt)}</p>
        {task.blockedReason ? (
          <p className="mt-2 text-sm text-[#c23b3b]">
            Vướng: {task.blockedReason} — {task.blockedAction}
          </p>
        ) : null}
        <form action={taskStatusAction} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={task.id} />
          <Field label="Cập nhật trạng thái">
            <select name="status" defaultValue={task.status}>
              {["in_progress", "done", "blocked", "archive"].map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s as TaskStatus]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ghi chú">
            <input name="note" placeholder="Đã nhận việc / đang lên phòng..." />
          </Field>
          <Field label="Nếu vướng — lý do">
            <input name="blockedReason" placeholder="Hết khăn / khách chưa ra..." />
          </Field>
          <Field label="Hướng xử lý">
            <input name="blockedAction" placeholder="Chờ ca sau / mua thêm..." />
          </Field>
          <Btn type="submit" className="w-full">
            Lưu trạng thái
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Gửi Zalo</h2>
        <ZaloShare id={task.id} message={message} />
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Lịch sử</h2>
        <ul className="space-y-2">
          {history.map((h) => {
            const actor = users.find((u) => u.id === h.actorId);
            return (
              <li key={h.id} className="text-sm">
                <span className="font-semibold">{actor?.fullName}</span> {h.toStatus}
                {h.note ? ` — ${h.note}` : ""}
                <span className="block text-[11px] text-[#6b7372]">{formatDateTime(h.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </main>
  );
}
