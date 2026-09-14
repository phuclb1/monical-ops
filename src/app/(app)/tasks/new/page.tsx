import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { TaskCreateForm } from "@/components/task-create-form";
import { getSession } from "@/lib/auth";
import { currentShiftType, todayVN } from "@/lib/datetime";
import { listRooms, listUsers, receptionDuty } from "@/lib/repos";
import { taskTypesByOwner } from "@/lib/task-types";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kind?: string; roomId?: string; stayId?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { error, kind, roomId, stayId } = await searchParams;
  const [rooms, users, duty] = await Promise.all([
    listRooms(),
    listUsers(),
    receptionDuty(todayVN(), currentShiftType()),
  ]);
  const groups = taskTypesByOwner(user.role);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Tạo việc</h1>
      <p className="text-xs text-[#5c6665]">
        Chọn loại việc đúng vai trò. Việc có phòng gắn label P.xxx; không phòng thì vào việc chung.
      </p>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <Card>
        <h2 className="mb-2 text-sm font-bold">Lễ tân tạo được</h2>
        <ul className="space-y-1 text-xs text-[#5c6665]">
          {groups.reception.map((item) => (
            <li key={item.kind}>
              <b className="text-ink">{item.label}</b> — {item.hint}
            </li>
          ))}
        </ul>
      </Card>
      {groups.hk.length ? (
        <Card>
          <h2 className="mb-2 text-sm font-bold">HK tạo / nhận</h2>
          <ul className="space-y-1 text-xs text-[#5c6665]">
            {groups.hk.map((item) => (
              <li key={item.kind}>
                <b className="text-ink">{item.label}</b> — {item.hint}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {groups.manager.length ? (
        <Card>
          <h2 className="mb-2 text-sm font-bold">Quản lý</h2>
          <ul className="space-y-1 text-xs text-[#5c6665]">
            {groups.manager.map((item) => (
              <li key={item.kind}>
                <b className="text-ink">{item.label}</b> — {item.hint}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <TaskCreateForm
          role={user.role}
          fromDept={user.departmentCode}
          rooms={rooms.map((r) => ({ id: r.id, number: r.number }))}
          users={users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            departmentCode: u.departmentCode,
            active: u.active,
          }))}
          onDutyId={duty.userId || undefined}
          defaultKind={kind}
          defaultRoomId={roomId}
          defaultStayId={stayId}
        />
      </Card>
      <p className="text-xs text-[#6b7372]">Việc thuộc web vận hành, không ghi đè booking ezCloudhotel.</p>
    </main>
  );
}
