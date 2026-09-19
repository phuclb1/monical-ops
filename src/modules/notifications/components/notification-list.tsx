import Link from "next/link";
import { Ban, Bell, CalendarPlus, Pencil } from "lucide-react";
import { openNotifAction } from "@/modules/notifications/actions/notifications.action";
import { Chip } from "@/components/ui";
import { TimeAgo } from "@/components/time-ago";

type Row = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

function kindOf(title: string) {
  if (title.startsWith("Đặt phòng") || title.startsWith("Thêm phòng")) {
    return { label: "Đặt", tone: "teal" as const, Icon: CalendarPlus, iconClass: "bg-[#dceeee] text-[#0f4c4c]" };
  }
  if (title.startsWith("Sửa")) {
    return { label: "Sửa", tone: "gold" as const, Icon: Pencil, iconClass: "bg-[#f7edd2] text-[#8a6a22]" };
  }
  if (title.startsWith("Hủy") || title.startsWith("No-show")) {
    return { label: "Hủy", tone: "danger" as const, Icon: Ban, iconClass: "bg-[#fde8e8] text-[#c23b3b]" };
  }
  return { label: "Tin", tone: "neutral" as const, Icon: Bell, iconClass: "bg-[#eee8dc] text-[#4d5554]" };
}

function splitTitle(title: string) {
  const sep = title.indexOf(" · ");
  if (sep < 0) return { kicker: kindOf(title).label, subject: title };
  return { kicker: title.slice(0, sep), subject: title.slice(sep + 3) };
}

function NotifBody({ n }: { n: Row }) {
  const kind = kindOf(n.title);
  const { kicker, subject } = splitTitle(n.title);
  const Icon = kind.Icon;
  return (
    <>
      <span className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${kind.iconClass}`}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className={`mt-0.5 block truncate text-[15px] leading-5 ${n.read ? "font-semibold text-[#4d5554]" : "font-bold text-ink"}`}>
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#8a7a72]">{kicker}</span>
              {" · "}
              {subject}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Chip tone={kind.tone}>{kind.label}</Chip>
            <TimeAgo iso={n.createdAt} />
          </span>
        </span>
        <span className="mt-1.5 block text-sm leading-5 text-[#5c6665]">{n.body}</span>
      </span>
    </>
  );
}

export function NotificationList({ rows }: { rows: Row[] }) {
  return (
    <div className="notif-list">
      {rows.map((n) => {
        const inner = <NotifBody n={n} />;
        return (
          <article key={n.id} className={`notif-card ${n.read ? "is-read" : "is-unread"}`}>
            {n.link && !n.read ? (
              <form action={openNotifAction}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="link" value={n.link} />
                <button type="submit" className="notif-card-hit">
                  {inner}
                </button>
              </form>
            ) : n.link ? (
              <Link href={n.link} className="notif-card-hit">
                {inner}
              </Link>
            ) : (
              <div className="notif-card-hit">{inner}</div>
            )}
          </article>
        );
      })}
    </div>
  );
}
