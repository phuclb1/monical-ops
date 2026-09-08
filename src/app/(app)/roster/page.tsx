import { redirect } from "next/navigation";
import { clearTomorrowRosterAction, saveTomorrowRosterAction, saveWeekRosterAction } from "@/actions/roster";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SHIFT_LABEL } from "@/lib/constants";
import { formatDateLong, formatDayMonth, formatWeekRange, nextDate, todayVN, weekOfVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listReceptionists, listWeekRoster, receptionDutyDay } from "@/lib/repos";
import { SHIFT_TYPES } from "@/lib/types";

function PersonSelect({
  name,
  people,
  value,
}: {
  name: string;
  people: { id: string; fullName: string }[];
  value: string;
}) {
  return (
    <select name={name} defaultValue={value} required>
      <option value="" disabled>
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
  const weekRange = formatWeekRange(today);
  const [people, weekSlots, tomorrowDuty, todayDuty] = await Promise.all([
    listReceptionists(),
    listWeekRoster(),
    receptionDutyDay(tomorrow),
    receptionDutyDay(today),
  ]);
  const weekMap = new Map(weekSlots.map((slot) => [`${slot.weekday}-${slot.shiftType}`, slot.userId]));
  const okText = ok === "week" ? "Đã lưu lịch tuần." : ok === "day" ? "Đã đổi ca ngày mai." : ok === "clear" ? "Đã bỏ đổi ca, về lịch tuần." : null;

  return (
    <main className="space-y-4 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Lịch lễ tân</h1>
        <p className="text-xs text-[#5c6665]">Xếp ca theo tuần. Cần cover thì đổi ca ngày mai — không sửa cả tuần.</p>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {okText ? <p className="text-sm text-[#1b7a4e]">{okText}</p> : null}

      <Card>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">Đổi ca ngày mai</h2>
            <p className="text-xs text-[#5c6665]">{formatDateLong(tomorrow)} · ad-hoc, không đổi lịch tuần</p>
          </div>
          {SHIFT_TYPES.some((shift) => tomorrowDuty.shifts[shift].source === "adhoc") ? (
            <Chip tone="warn">Đã đổi</Chip>
          ) : (
            <Chip tone="neutral">Theo tuần</Chip>
          )}
        </div>
        <form action={saveTomorrowRosterAction} className="space-y-2">
          <input type="hidden" name="date" value={tomorrow} />
          {SHIFT_TYPES.map((shift) => {
            const duty = tomorrowDuty.shifts[shift];
            const weekUser = weekMap.get(`${tomorrowDuty.weekday}-${shift}`) || "";
            return (
              <Field key={shift} label={`${SHIFT_LABEL[shift]}${duty.source === "adhoc" ? " · đang lệch tuần" : ""}`}>
                <PersonSelect name={`d-${shift}`} people={people} value={duty.userId || weekUser} />
              </Field>
            );
          })}
          <Field label="Lý do (tuỳ chọn)">
            <input name="note" placeholder="Thu cover ca sáng, Ngân nghỉ..." />
          </Field>
          <Btn type="submit" className="w-full">
            Lưu đổi ca ngày mai
          </Btn>
        </form>
        <form action={clearTomorrowRosterAction} className="mt-2">
          <input type="hidden" name="date" value={tomorrow} />
          <Btn type="submit" variant="ghost" className="w-full">
            Bỏ đổi ca — về lịch tuần
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold">Hôm nay</h2>
        <p className="mb-3 text-xs text-[#5c6665]">{formatDateLong(today)} · chỉ xem, muốn đổi thì dùng ô ngày mai từ hôm qua</p>
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

      <Card>
        <h2 className="mb-1 font-bold">Lịch tuần này</h2>
        <p className="mb-3 text-xs text-[#5c6665]">
          {weekRange} · lặp mỗi tuần. Sửa ô là đổi lịch tuần, không phải một ngày.
        </p>
        <form action={saveWeekRosterAction} className="space-y-3">
          <div className="overflow-x-auto">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Ca</th>
                  {weekDays.map((day) => {
                    const isToday = day.date === today;
                    const isTomorrow = day.date === tomorrow;
                    return (
                      <th key={day.iso} className={isToday ? "is-today" : isTomorrow ? "is-tomorrow" : undefined}>
                        <span className="roster-dow">{day.short}</span>
                        <span className="roster-date">{formatDayMonth(day.date)}</span>
                        {isToday ? <span className="roster-tag">Hôm nay</span> : null}
                        {isTomorrow ? <span className="roster-tag">Ngày mai</span> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {SHIFT_TYPES.map((shift) => (
                  <tr key={shift}>
                    <th>{SHIFT_LABEL[shift]}</th>
                    {weekDays.map((day) => (
                      <td key={day.iso} className={day.date === today ? "is-today" : day.date === tomorrow ? "is-tomorrow" : undefined}>
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
            Lưu lịch tuần
          </Btn>
        </form>
      </Card>
    </main>
  );
}
