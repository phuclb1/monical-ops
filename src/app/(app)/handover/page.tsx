import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptHandoverAction, createHandoverAction } from "@/actions/ops";
import { Btn, Card, Chip, Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { buildHandoverDraft, listHandovers } from "@/lib/repos";

export default async function HandoverPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [list, draft] = await Promise.all([listHandovers(), buildHandoverDraft()]);
  const pending = list.find((h) => h.status === "submitted");

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Bàn giao ca</h1>
      <p className="text-xs text-[#5c6665]">Hệ thống gom việc tồn — không chỉ một ô ghi chú chung.</p>

      {pending && !pending.acceptedBy ? (
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-bold">Ca trước chờ nhận</p>
            <Chip tone="warn">Chưa nhận</Chip>
          </div>
          <p className="mt-1 text-sm">{pending.notes}</p>
          <form action={acceptHandoverAction} className="mt-3">
            <input type="hidden" name="id" value={pending.id} />
            <Btn type="submit" className="w-full">
              Đã nhận bàn giao
            </Btn>
          </form>
          <Link href={`/handover/${pending.id}`} className="mt-2 block text-center text-sm font-semibold text-teal">
            Xem chi tiết
          </Link>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">Việc tồn sẽ vào bàn giao</h2>
        {draft.length === 0 ? <Empty title="Không còn việc tồn" /> : null}
        <ul className="space-y-2">
          {draft.map((item, i) => (
            <li key={`${item.refId}-${i}`} className="text-sm">
              <span className="font-semibold text-teal">{item.category}</span>
              <span className="block">{item.summary}</span>
            </li>
          ))}
        </ul>
        <form action={createHandoverAction} className="mt-3 space-y-2">
          <textarea name="notes" placeholder="Ghi chú thêm cho ca sau" />
          <Btn type="submit" className="w-full" variant="gold">
            Tạo bàn giao từ dữ liệu tồn
          </Btn>
        </form>
      </Card>

      <h2 className="pt-2 font-bold">Lịch sử</h2>
      {list.map((h) => (
        <Link key={h.id} href={`/handover/${h.id}`}>
          <Card className="mb-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{h.creator?.fullName} giao</p>
              <Chip tone={h.acceptedBy ? "ok" : "warn"}>{h.acceptedBy ? "Đã nhận" : "Chờ nhận"}</Chip>
            </div>
            <p className="text-xs text-[#5c6665]">
              {formatDateTime(h.createdAt)}
              {h.acceptor ? ` · ${h.acceptor.fullName} nhận ${formatDateTime(h.acceptedAt)}` : ""}
            </p>
          </Card>
        </Link>
      ))}
    </main>
  );
}
