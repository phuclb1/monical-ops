import { appOrigin, rewriteLocalhostUrl } from "@/lib/site";
import type { DepartmentCode, TaskPriority } from "@/lib/types";
import { buildZaloMessage } from "@/lib/zalo";

type TaskBundle = {
  task: {
    id: string;
    area: string | null;
    content: string;
    priority: string;
    dueAt: string | null;
    assigneeId: string | null;
    toDept: string;
    zaloMessage: string | null;
  };
  users: { id: string; fullName: string }[];
  room?: { number: string } | null;
};

export async function messageFromTask(data: TaskBundle) {
  const { task, users, room } = data;
  const assignee = users.find((user) => user.id === task.assigneeId);
  const origin = await appOrigin();
  const built = buildZaloMessage({
    room: room?.number,
    area: task.area,
    priority: task.priority as TaskPriority,
    content: task.content,
    dueAt: task.dueAt,
    assignee: assignee?.fullName,
    dept: task.toDept as DepartmentCode,
    url: `${origin}/tasks/${task.id}`,
  });
  return task.zaloMessage ? rewriteLocalhostUrl(task.zaloMessage, origin) : built;
}
