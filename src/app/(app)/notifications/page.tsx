import Link from "next/link";
import { redirect } from "next/navigation";
import { readNotifAction } from "@/actions/ops";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { listNotifications } from "@/lib/repos";

export default async function NotificationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const rows = await listNotifications(user);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Thông báo</h1>
      {rows.map((n) => (
        <Card key={n.id} className={n.read ? "opacity-70" : ""}>
          <p className="font-semibold">{n.title}</p>
          <p className="text-sm">{n.body}</p>
          <p className="text-[11px] text-[#6b7372]">{formatDateTime(n.createdAt)}</p>
          <div className="mt-2 flex gap-2">
            {n.link ? (
              <Link href={n.link} className="text-sm font-semibold text-teal">
                Mở
              </Link>
            ) : null}
            {!n.read ? (
              <form action={readNotifAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className="text-sm font-semibold">Đã đọc</button>
              </form>
            ) : null}
          </div>
        </Card>
      ))}
    </main>
  );
}
