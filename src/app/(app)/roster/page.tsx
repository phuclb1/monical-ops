import { redirect } from "next/navigation";
import { clearTomorrowRosterAction, saveTomorrowRosterAction, saveWeekRosterAction } from "@/actions/roster";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SHIFT_LABEL } from "@/lib/constants";
import { formatDateLong, nextDate, todayVN, weekOfVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listReceptionists, listWeekRoster, receptionDutyDay } from "@/lib/repos";
import { SHIFT_TYPES } from "@/lib/types";

function PersonSelect({
  name,
  people,
  value,
  required,
}: {
  name: string;
  people: { id: string; fullName: string }[];
  value: string;
  required?: boolean;
}) {
  return (
    <select name={name} defaultValue={value} required={required}>
      <option value="" disabled={required}>
        Chọn lễ tân
      </option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullName}
        </option>
      ))}
    </select>
  );
}

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageRoster")) redirect("/more");
  const { error, ok } = await searchParams;
  const today = todayVN();
  const tomorrow = nextDate(today);
  const weekDays = weekOfVN(today);
  const [people, week, tomorrowDuty, todayDuty] = await Promise.all([
    listReceptionists(),
    listWeekRoster(today),
    receptionDutyDay(tomorrow),
    receptionDutyDay(today),
  ]);
  const weekMap = new Map(week.slots.map((slot) => [`${slot.weekday}-${slot.shiftType}`, slot.userId]));
  const okText =
    ok === "week"
      ? "Đã áp dụng lịch từ hôm nay. Chạy đến khi lưu lịch mới."
      : ok === "day"
        ? "Đã đổi ca ngày mai."
        : ok === "clear"
          ? "Đã bỏ đổi ca, về lịch đang áp dụng."
          : null;

  return (
    <main className="space-y-4 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Lịch lễ tân</h1>
        <p className="text-xs text-[#5c6665]">Xếp một lần. Lịch chạy từ ngày lưu đến khi bạn lưu lịch mới.</p>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {okText ? <p className="text-sm text-[#1b7a4e]">{okText}</p> : null}

      <Card>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">Lịch đang áp dụng</h2>
            <p className="text-xs text-[#5c6665]">
              {week.effectiveFrom
                ? `Từ ${formatDateLong(week.effectiveFrom)} · lặp T2–CN đến khi đổi`
                : "Chưa có lịch. Chọn lễ tân rồi áp dụng."}
            </p>
          </div>
          <Chip tone={week.effectiveFrom ? "ok" : "warn"}>{week.effectiveFrom ? "Đang chạy" : "Chưa xếp"}</Chip>
        </div>
        <form action={saveWeekRosterAction} className="space-y-3">
          <div className="rounded-xl bg-sand p-3">
            <p className="mb-2 text-xs font-semibold text-[#5c6665]">Gán cả tuần (cùng người mỗi ca)</p>
            <div className="grid gap-2">
              {SHIFT_TYPES.map((shift) => (
                <Field key={shift} label={SHIFT_LABEL[shift]}>
                  <PersonSelect name={`fill-${shift}`} people={people} value="" />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#8a7a72]">Để trống nếu muốn xếp từng ngày ở bảng dưới.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Ca</th>
                  {weekDays.map((day) => (
                    <th key={day.iso}>
                      <span className="roster-dow">{day.short}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIFT_TYPES.map((shift) => (
                  <tr key={shift}>
                    <th>{SHIFT_LABEL[shift]}</th>
                    {weekDays.map((day) => (
                      <td key={day.iso}>
                        <PersonSelect
                          name={`w-${day.iso}-${shift}`}
                          people={people}
                          value={weekMap.get(`${day.iso}-${shift}`) || ""}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Btn type="submit" className="w-full">
            Áp dụng từ hôm nay
          </Btn>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">Đổi ca ngày mai</h2>
            <p className="text-xs text-[#5c6665]">{formatDateLong(tomorrow)} · cover một ngày, không đổi lịch đang chạy</p>
          </div>
          {SHIFT_TYPES.some((shift) => tomorrowDuty.shifts[shift].source === "adhoc") ? (
            <Chip tone="warn">Đã đổi</Chip>
          ) : (
            <Chip tone="neutral">Theo lịch</Chip>
          )}
        </div>
        <form action={saveTomorrowRosterAction} className="space-y-2">
          <input type="hidden" name="date" value={tomorrow} />
          {SHIFT_TYPES.map((shift) => {
            const duty = tomorrowDuty.shifts[shift];
            const weekUser = weekMap.get(`${tomorrowDuty.weekday}-${shift}`) || "";
            return (
              <Field key={shift} label={`${SHIFT_LABEL[shift]}${duty.source === "adhoc" ? " · đang lệch lịch" : ""}`}>
                <PersonSelect name={`d-${shift}`} people={people} value={duty.userId || weekUser} required />
              </Field>
            );
          })}
          <Field label="Lý do (tuỳ chọn)">
            <input name="note" placeholder="Cover ca sáng, nghỉ phép..." />
          </Field>
          <Btn type="submit" className="w-full">
            Lưu đổi ca ngày mai
          </Btn>
        </form>
        <form action={clearTomorrowRosterAction} className="mt-2">
          <input type="hidden" name="date" value={tomorrow} />
          <Btn type="submit" variant="ghost" className="w-full">
            Bỏ đổi ca — về lịch đang áp dụng
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">Hôm nay</h2>
        <p className="mb-3 text-xs text-[#5c6665]">{formatDateLong(today)}</p>
        <ul className="space-y-1 text-sm">
          {SHIFT_TYPES.map((shift) => {
            const duty = todayDuty.shifts[shift];
            return (
              <li key={shift} className="flex items-center justify-between gap-2">
                <span>{SHIFT_LABEL[shift]}</span>
                <span className="font-semibold">
                  {duty.user?.fullName || "Chưa gán"}
                  {duty.source === "adhoc" ? " · đổi ca" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </main>
  );
}
