import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, Empty, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { DEPT_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { formatTime } from "@/lib/datetime";
import { listRooms, listTasks, listUsers } from "@/lib/repos";
import { TASK_BOARD, TASK_BOARD_LABEL, TASK_TYPES, taskBoardColumn, taskTypeLabel, type TaskBoardColumn } from "@/lib/task-types";
import type { DepartmentCode, TaskPriority, TaskStatus } from "@/lib/types";

const TONE: Record<string, "ok" | "warn" | "danger" | "teal" | "neutral"> = {
  new: "teal",
  accepted: "neutral",
  in_progress: "warn",
  done: "ok",
  checked: "ok",
  blocked: "danger",
  archive: "neutral",
  urgent: "danger",
  priority: "warn",
  normal: "neutral",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ column?: string; kind?: string; group?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { column, kind, group } = await searchParams;
  const boardColumn = column && column in TASK_BOARD ? (column as TaskBoardColumn) : undefined;
  const groupFilter = group === "room" || group === "general" ? group : undefined;
  const [tasks, rooms, users] = await Promise.all([
    listTasks({ column: boardColumn, kind: kind || undefined, group: groupFilter }),
    listRooms(),
    listUsers(),
  ]);
  const columns = (Object.keys(TASK_BOARD) as TaskBoardColumn[]).filter((key) => key !== "archive" || boardColumn === "archive");
  const grouped = Object.fromEntries(
    columns.map((key) => [key, tasks.filter((task) => taskBoardColumn(task.status) === key)]),
  ) as Record<TaskBoardColumn, typeof tasks>;

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bảng việc</h1>
        <Link href="/tasks/new" className="cta-link">
          Tạo việc
        </Link>
      </div>

      <div className="tab-scroller -mx-3 px-3">
        <TabChip href="/tasks" active={!boardColumn && !group && !kind}>
          Bảng ngày
        </TabChip>
        {(Object.keys(TASK_BOARD_LABEL) as TaskBoardColumn[]).map((key) => (
          <TabChip key={key} href={`/tasks?column=${key}`} active={boardColumn === key}>
            {TASK_BOARD_LABEL[key]}
          </TabChip>
        ))}
      </div>
      <div className="tab-scroller -mx-3 px-3">
        <TabChip href={column ? `/tasks?column=${column}` : "/tasks"} active={!group}>
          Tất cả nhóm
        </TabChip>
        <TabChip href={`/tasks?group=room${column ? `&column=${column}` : ""}`} active={group === "room"}>
          Theo phòng
        </TabChip>
        <TabChip href={`/tasks?group=general${column ? `&column=${column}` : ""}`} active={group === "general"}>
          Việc chung
        </TabChip>
      </div>
      <div className="tab-scroller -mx-3 px-3">
        {TASK_TYPES.filter((item) => item.canCreate.length).slice(0, 8).map((item) => (
          <TabChip key={item.kind} href={`/tasks?kind=${item.kind}`} active={kind === item.kind}>
            {item.label}
          </TabChip>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(boardColumn ? [boardColumn] : (["new", "doing", "done"] as TaskBoardColumn[])).map((key) => (
          <section key={key}>
            <h2 className="mb-2 text-sm font-bold">
              {TASK_BOARD_LABEL[key]} <span className="text-[#8a918f]">{grouped[key]?.length ?? 0}</span>
            </h2>
            {(grouped[key] ?? []).length === 0 ? <Empty title="Trống" /> : null}
            {(grouped[key] ?? []).map((task) => {
              const room = rooms.find((r) => r.id === task.roomId);
              const who = users.find((u) => u.id === task.assigneeId);
              const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !["done", "checked", "archive"].includes(task.status);
              return (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block">
                  <Card className="mb-2 min-h-16">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{task.content}</p>
                      <Chip tone={TONE[task.priority]}>{PRIORITY_LABEL[task.priority as TaskPriority]}</Chip>
                    </div>
                    <p className="mt-1 text-xs text-[#5c6665]">
                      {taskTypeLabel(task.kind)}
                      {room ? ` · P.${room.number}` : " · Chung"}
                      {task.area && !room ? ` · ${task.area}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Chip tone={TONE[task.status]}>{TASK_STATUS_LABEL[task.status as TaskStatus]}</Chip>
                      {overdue ? <Chip tone="danger">Quá hạn</Chip> : null}
                      <Chip>{DEPT_LABEL[task.toDept as DepartmentCode] || task.toDept}</Chip>
                      {who ? <Chip>{who.fullName}</Chip> : null}
                      {task.dueAt ? <Chip>Hạn {formatTime(task.dueAt)}</Chip> : null}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
