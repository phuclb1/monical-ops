import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listRooms, listTasks, listUsers } from "@/lib/repos";
import { DEPT_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { formatTime } from "@/lib/datetime";
import { Card, Chip, Empty } from "@/components/ui";
import type { DepartmentCode, TaskPriority, TaskStatus } from "@/lib/types";

const TONE: Record<string, "ok" | "warn" | "danger" | "teal" | "neutral"> = {
  new: "teal",
  accepted: "neutral",
  in_progress: "warn",
  done: "ok",
  checked: "ok",
  blocked: "danger",
  urgent: "danger",
  priority: "warn",
  normal: "neutral",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { status } = await searchParams;
  const [tasks, rooms, users] = await Promise.all([listTasks({ status }), listRooms(), listUsers()]);

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Công việc liên bộ phận</h1>
        <Link href="/tasks/new" className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white">
          Tạo việc
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {["", "new", "in_progress", "blocked", "done"].map((s) => (
          <Link
            key={s}
            href={s ? `/tasks?status=${s}` : "/tasks"}
            className={`rounded-full px-3 py-1 text-xs font-bold ${status === s || (!s && !status) ? "bg-teal text-white" : "bg-white"}`}
          >
            {s ? TASK_STATUS_LABEL[s as TaskStatus] : "Tất cả"}
          </Link>
        ))}
      </div>
      {tasks.length === 0 ? <Empty title="Không có việc" /> : null}
      <div className="list-cards">
      {tasks.map((task) => {
        const room = rooms.find((r) => r.id === task.roomId);
        const who = users.find((u) => u.id === task.assigneeId);
        const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !["done", "checked"].includes(task.status);
        return (
          <Link key={task.id} href={`/tasks/${task.id}`}>
            <Card className="mb-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{task.content}</p>
                <Chip tone={TONE[task.priority]}>{PRIORITY_LABEL[task.priority as TaskPriority]}</Chip>
              </div>
              <p className="mt-1 text-xs text-[#5c6665]">
                {DEPT_LABEL[task.fromDept as DepartmentCode]} → {DEPT_LABEL[task.toDept as DepartmentCode]}
                {room ? ` · P.${room.number}` : task.area ? ` · ${task.area}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip tone={TONE[task.status]}>{TASK_STATUS_LABEL[task.status as TaskStatus]}</Chip>
                {overdue ? <Chip tone="danger">Quá hạn</Chip> : null}
                {task.zaloSent ? <Chip tone="ok">Đã gửi Zalo</Chip> : <Chip>Chưa Zalo</Chip>}
                {who ? <Chip>{who.fullName}</Chip> : null}
                {task.dueAt ? <Chip>Hạn {formatTime(task.dueAt)}</Chip> : null}
              </div>
            </Card>
          </Link>
        );
      })}
      </div>
    </main>
  );
}
