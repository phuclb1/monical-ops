import { redirect } from "next/navigation";
import { createTaskAction } from "@/actions/ops";
import { Btn, Card, Field } from "@/components/ui";
import { TaskDeptAssignee } from "@/components/task-dept-assignee";
import { getSession } from "@/lib/auth";
import { listRooms, listUsers } from "@/lib/repos";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const [rooms, users] = await Promise.all([listRooms(), listUsers()]);
  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Tạo việc liên bộ phận</h1>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      <Card>
        <form action={createTaskAction} className="space-y-3">
          <TaskDeptAssignee
            fromDept={user.departmentCode}
            defaultToDept="hk"
            users={users.map((u) => ({
              id: u.id,
              fullName: u.fullName,
              departmentCode: u.departmentCode,
              active: u.active,
            }))}
          />
          <Field label="Phòng">
            <select name="roomId" defaultValue="">
              <option value="">Không gắn phòng</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  P.{r.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Khu vực">
            <input name="area" placeholder="Sảnh, bếp, hồ bơi..." />
          </Field>
          <Field label="Nội dung">
            <textarea name="content" required placeholder="Cần 2 khăn trước 22:30" />
          </Field>
          <Field label="Mức độ">
            <select name="priority" defaultValue="normal">
              <option value="normal">Thường</option>
              <option value="priority">Ưu tiên</option>
              <option value="urgent">Khẩn</option>
            </select>
          </Field>
          <Field label="Hạn hoàn thành">
            <input type="datetime-local" name="dueAt" />
          </Field>
          <Btn type="submit" className="w-full">
            Tạo việc
          </Btn>
        </form>
      </Card>
      <p className="text-xs text-[#6b7372]">
        Việc này thuộc web vận hành, không ghi đè booking trên ezCloudhotel. Sau khi tạo, gửi Zalo từ trang chi tiết.
      </p>
    </main>
  );
}
