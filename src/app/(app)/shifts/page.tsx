import { redirect } from "next/navigation";
import { closeShiftAction, openShiftAction, skipCheckAction, toggleCheckAction } from "@/actions/ops";
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

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Ca làm việc</h1>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {!open ? (
        <form action={openShiftAction}>
          <Btn type="submit" className="w-full">
            Mở ca
          </Btn>
        </form>
      ) : (
        <Card>
          <p className="font-bold">
            {SHIFT_LABEL[open.type as keyof typeof SHIFT_LABEL]} · {open.date}
          </p>
          <Chip tone="ok">Đang mở</Chip>
        </Card>
      )}

      {bundle?.checklists.map((list) => (
        <Card key={list.id}>
          <h2 className="mb-2 font-bold">{list.title}</h2>
          <ul className="space-y-3">
            {list.items.map((item) => (
              <li key={item.id}>
                <div className="flex items-start gap-2">
                  <form action={toggleCheckAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white">
                      {item.done ? "✓" : ""}
                    </button>
                  </form>
                  <div className="flex-1">
                    <p className={item.done ? "text-sm line-through" : "text-sm font-medium"}>{item.label}</p>
                    {item.required ? <p className="text-[11px] text-[#c47b12]">Bắt buộc</p> : null}
                    {!item.done && item.required ? (
                      <form action={skipCheckAction} className="mt-1 flex gap-1">
                        <input type="hidden" name="itemId" value={item.id} />
                        <input name="reason" placeholder="Lý do bỏ qua" className="min-h-9" />
                        <button className="rounded-lg bg-white px-2 text-xs font-semibold">Lý do</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {open ? (
        <form action={closeShiftAction} className="space-y-2">
          <textarea name="reason" placeholder="Bắt buộc nếu còn mục chưa xong hoặc chưa bàn giao" />
          <Btn type="submit" variant="danger" className="w-full">
            Kết ca
          </Btn>
        </form>
      ) : null}
    </main>
  );
}
