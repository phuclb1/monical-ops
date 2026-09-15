import Link from "next/link";
import { redirect } from "next/navigation";
import { closeShiftAction, openShiftAction } from "@/actions/ops";
import { ChecklistPanel } from "@/components/checklist-panel";
import { Btn, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SHIFT_LABEL } from "@/lib/constants";
import { currentOpenShift, getShiftBundle } from "@/lib/repos";

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const open = await currentOpenShift();
  const bundle = open ? await getShiftBundle(open.id, user.role === "manager" ? undefined : user.departmentCode) : null;
  const lists = (bundle?.checklists ?? []).slice().sort((a, b) => (a.kind === "shift_open" ? -1 : 1));

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Ca làm việc</h1>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {!open ? (
        user.role === "reception" ? (
          <form action={openShiftAction}>
            <Btn type="submit" className="w-full">
              Mở ca
            </Btn>
          </form>
        ) : (
          <Card>
            <p className="font-bold">Ca lễ tân chưa mở</p>
            <p className="mt-1 text-sm text-[#5c6665]">
              {user.role === "manager"
                ? "Quản lý không cần start ca. Checklist đầu / cuối ca thuộc lễ tân đang trực."
                : "Chờ lễ tân mở ca để có checklist đầu / cuối ca."}
            </p>
            {user.role === "manager" ? (
              <form action={openShiftAction} className="mt-3">
                <Btn type="submit" variant="ghost" className="w-full">
                  Mở ca hộ — đang đứng quầy
                </Btn>
              </form>
            ) : null}
          </Card>
        )
      ) : (
        <Card>
          <p className="font-bold">
            {SHIFT_LABEL[open.type as keyof typeof SHIFT_LABEL]} · {open.date}
          </p>
          <Chip tone="ok">Đang mở</Chip>
        </Card>
      )}

      {lists.map((list) => (
        <div key={list.id} className="space-y-2">
          {list.taskId ? (
            <Link href={`/tasks/${list.taskId}`} className="block text-sm font-semibold text-teal">
              Mở việc {list.title}
            </Link>
          ) : null}
          <ChecklistPanel list={list} hint="Tick tay. Bỏ qua thì ghi lý do. Note / ảnh tuỳ chọn." />
        </div>
      ))}

      {open ? (
        <form action={closeShiftAction} className="space-y-2">
          <textarea name="reason" placeholder="Bắt buộc nếu chưa bàn giao. Checklist dở không chặn kết ca." />
          <Btn type="submit" variant="danger" className="w-full">
            Kết ca
          </Btn>
        </form>
      ) : null}
    </main>
  );
}
