import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { currentOpenShift, getDashboard, getShiftBundle } from "@/lib/repos";
import { SHIFT_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { formatDateLong, formatTime, nextDate, remainingLabel, todayVN } from "@/lib/datetime";
import { Card, Chip, Empty, SectionTitle, Stat } from "@/components/ui";
import { RegistrationTimer } from "@/components/countdown";
import { openShiftAction } from "@/actions/ops";
import { toggleCheckAction } from "@/actions/ops";

export default async function TodayPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const data = await getDashboard(user);
  const open = await currentOpenShift();
  const bundle = open ? await getShiftBundle(open.id, user.role === "manager" ? undefined : user.departmentCode) : null;
  const myList = bundle?.checklists.find((c) => c.departmentCode === user.departmentCode) ?? bundle?.checklists[0];

  return (
    <main className="today-grid space-y-4 px-3 py-4 md:space-y-0">
      <Card className="today-wide">
        {data.shift ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-teal">Ca đang làm</p>
              <h1 className="text-xl font-bold">
                {SHIFT_LABEL[data.shift.type as keyof typeof SHIFT_LABEL]} · {formatDateLong(data.shift.date)}
              </h1>
              <p className="mt-1 text-sm text-[#5c6665]">
                Mở {formatTime(data.shift.openedAt)} · {data.shiftEnd ? remainingLabel(data.shiftEnd) : ""}
              </p>
              <p className="mt-1 text-sm">
                Trực lễ tân: <b>{data.duty.user?.fullName || "Chưa gán"}</b>
                {data.duty.source === "adhoc" ? " · đổi ca" : ""}
              </p>
            </div>
            <Chip tone={data.handover && !data.handover.acceptedBy ? "warn" : "ok"}>
              {data.handover && !data.handover.acceptedBy ? "Chưa nhận bàn giao" : "Ca đang chạy"}
            </Chip>
          </div>
        ) : user.role === "reception" ? (
          <form action={openShiftAction}>
            <h1 className="text-xl font-bold">Chưa mở ca</h1>
            <p className="mt-1 text-sm text-[#5c6665]">Mở ca để nhận checklist đúng ca sáng / chiều / đêm.</p>
            <button className="mt-3 w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white">Mở ca hiện tại</button>
          </form>
        ) : (
          <div>
            <h1 className="text-xl font-bold">Ca lễ tân chưa mở</h1>
            <p className="mt-1 text-sm text-[#5c6665]">
              Ca là khung việc của lễ tân đang trực, không phải giờ vào của quản lý. Dashboard vẫn xem được.
            </p>
            <p className="mt-1 text-sm">
              Trực lễ tân: <b>{data.duty.user?.fullName || "Chưa gán"}</b>
            </p>
            {user.role === "manager" ? (
              <form action={openShiftAction}>
                <button className="mt-3 w-full rounded-xl border border-line bg-white py-3 text-sm font-semibold">
                  Mở ca hộ — đang đứng quầy
                </button>
              </form>
            ) : null}
          </div>
        )}
      </Card>

      {user.role === "reception" || user.role === "manager" ? (
        <Card>
          <SectionTitle hint={formatDateLong(nextDate(todayVN()))}>Lễ tân ngày mai</SectionTitle>
          <ul className="space-y-1 text-sm">
            {(["morning", "afternoon", "night"] as const).map((shift) => (
              <li key={shift} className="flex justify-between gap-2">
                <span>{SHIFT_LABEL[shift]}</span>
                <span className="font-semibold">
                  {data.tomorrowDuty.shifts[shift].user?.fullName || "Chưa gán"}
                  {data.tomorrowDuty.shifts[shift].source === "adhoc" ? " · đổi ca" : ""}
                </span>
              </li>
            ))}
          </ul>
          {can(user.role, "manageRoster") ? (
            <Link href="/roster" className="mt-3 block text-sm font-semibold text-teal">
              Xếp lịch / đổi ca ngày mai
            </Link>
          ) : null}
        </Card>
      ) : null}

      <div className="today-wide grid grid-cols-3 gap-2 md:gap-3">
        <Stat label="Việc ngay" value={data.nowTasks.length} />
        <Stat label="Quá hạn" value={data.overdueTasks.length} tone="text-[#c23b3b]" />
        <Stat label="Yêu cầu" value={data.openRequests.length} tone="text-[#c47b12]" />
      </div>

      <Card>
        <SectionTitle hint="Ca này">Việc phải làm ngay</SectionTitle>
        {myList?.items.length ? (
          <ul className="space-y-2">
            {myList.items.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <form action={toggleCheckAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <button className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-white text-xs">
                    {item.done ? "✓" : ""}
                  </button>
                </form>
                <div>
                  <p className={item.done ? "text-sm line-through text-[#8a918f]" : "text-sm font-medium"}>{item.label}</p>
                  {item.required ? <p className="text-[11px] text-[#c47b12]">Bắt buộc</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="Chưa có checklist"
            text={user.role === "reception" ? "Mở ca để sinh checklist." : "Checklist sinh khi lễ tân mở ca."}
          />
        )}
        <Link href="/shifts" className="mt-3 block text-center text-sm font-semibold text-teal">
          Xem hết checklist ca
        </Link>
      </Card>

      {data.overdueTasks.length ? (
        <Card>
          <SectionTitle hint="Ưu tiên">Việc quá hạn</SectionTitle>
          <ul className="space-y-2">
            {data.overdueTasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{task.content}</span>
                  <Chip tone="danger">Trễ</Chip>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Khách hôm nay</SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Link href="/reception" className="rounded-xl bg-[#e8f3f2] p-2">
            <p className="text-xl font-bold">{data.arriving.length}</p>
            <p className="text-[11px]">Đến</p>
          </Link>
          <Link href="/reception" className="rounded-xl bg-[#fff1d6] p-2">
            <p className="text-xl font-bold">{data.departing.length}</p>
            <p className="text-[11px]">Đi</p>
          </Link>
          <Link href="/reception" className="rounded-xl bg-[#fde8e8] p-2">
            <p className="text-xl font-bold">{data.noShow.length}</p>
            <p className="text-[11px]">Chưa đến</p>
          </Link>
        </div>
        {data.stays
          .filter((s) => s.status === "inhouse" && s.registrationDueAt && !s.registrationDoneAt)
          .map((s) => (
            <Link key={s.id} href={`/reception/${s.id}`} className="mt-3 block rounded-xl bg-[#fff8ea] p-3">
              <p className="text-sm font-semibold">Đăng ký lưu trú — {s.guestName}</p>
              <RegistrationTimer dueAt={s.registrationDueAt} doneAt={s.registrationDoneAt} />
            </Link>
          ))}
      </Card>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <Stat label="Đang dọn" value={data.cleaning.length} />
        <Stat label="INS" value={data.ins.length} tone="text-teal" />
        <Stat label="OOO" value={data.ooo.length} tone="text-[#c23b3b]" />
      </div>

      <Card>
        <SectionTitle>Ăn sáng ngày mai</SectionTitle>
        {data.breakfast ? (
          <p className="text-sm">
            {data.breakfast.adults} NL · {data.breakfast.children} TE · chay {data.breakfast.vegetarian} · dị ứng{" "}
            {data.breakfast.allergy} · sớm {data.breakfast.early} · mang đi {data.breakfast.takeaway}
          </p>
        ) : (
          <Empty title="Chưa gửi số" />
        )}
        <Link href="/kitchen" className="mt-2 block text-sm font-semibold text-teal">
          Mở bếp / dự báo
        </Link>
      </Card>

      <Link href="/handover" className="today-wide block rounded-2xl bg-gold py-4 text-center text-base font-bold text-[#2b230f]">
        Bàn giao ca
      </Link>
    </main>
  );
}
