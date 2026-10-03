import { redirect } from "next/navigation";
import { readAllNotifAction } from "@/modules/notifications/actions/notifications.action";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { PushPrompt } from "@/modules/notifications/components/push-prompt";
import { Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { listNotifications } from "@/modules/notifications/models/notifications";

function hintFor(role: string) {
  if (role === "manager") return "Mọi thêm, sửa, hủy booking đều hiện ở đây.";
  if (role === "reception") return "Chỉ hiện thêm, sửa, hủy booking do bạn tạo.";
  return null;
}

export default async function NotificationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const rows = (await listNotifications(user)).filter((n) => !n.read);
  const hint = hintFor(user.role);

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Thông báo</h1>
          {hint ? <p className="mt-1 text-sm text-[#5c6665]">{hint}</p> : null}
        </div>
        {rows.length ? (
          <form action={readAllNotifAction}>
            <button className="text-sm font-semibold text-teal">Đọc hết · {rows.length}</button>
          </form>
        ) : null}
      </div>
      <PushPrompt variant="panel" />
      {rows.length === 0 ? (
        <Empty title="Không còn thông báo mới" text="Bấm một thông báo là mở nội dung và xóa khỏi danh sách này." />
      ) : (
        <NotificationList rows={rows} />
      )}
    </main>
  );
}
