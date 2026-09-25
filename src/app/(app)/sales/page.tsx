import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, Stat, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { addDaysVN, addMonthsVN, formatDayMonth, formatMonthLong, startOfMonthVN, todayVN } from "@/lib/datetime";
import { maskName } from "@/lib/mask";
import { homePath } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { salesGantt, roomFocusBoard, listRoomTypes } from "@/lib/repos";
import { formatVnd, groupByBooking, isSaleOrigin, rollupBookingStatus } from "@/lib/sales";
import { isRoomFocus } from "@/lib/room-focus";
import { ParkingIcons } from "@/components/parking-icons";
import { RoomFocusChips } from "@/components/room-focus-chips";
import { RoomGantt } from "@/components/room-gantt";
import type { SaleSource, SaleStatus } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  vacant: "Trống",
  reserved: "Chưa nhận",
  inhouse: "Đang ở",
  departed: "Đã trả",
  ooo: "OOO",
};

const TILE: Record<string, string> = {
  vacant: "border-line bg-white",
  reserved: "border-[#e8c9a0] bg-[#fff1d2]",
  inhouse: "border-[#c9e6e4] bg-[#dceeee]",
  departed: "border-[#cfcfcf] bg-[#e6e6e6]",
  ooo: "border-[#f1c7c7] bg-[#fde8e8]",
};

const VIEWS = [
  { id: "7", label: "7 ngày" },
  { id: "15", label: "15 ngày" },
  { id: "month", label: "1 tháng" },
] as const;

const GROUPS = [
  { id: "floor", label: "Theo tầng" },
  { id: "type", label: "Theo hạng phòng" },
] as const;

type SalesView = (typeof VIEWS)[number]["id"];
type SalesGroup = (typeof GROUPS)[number]["id"];

function parseView(value: string): SalesView {
  if (value === "15") return "15";
  if (value === "month") return "month";
  return "7";
}

function parseGroup(value: string): SalesGroup {
  return value === "type" ? "type" : "floor";
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <TabChip href={href} active={active}>
      {children}
    </TabChip>
  );
}

function viewWindow(view: SalesView, date: string) {
  if (view === "month") {
    const from = startOfMonthVN(date);
    return { from, to: addMonthsVN(from, 1), prev: addMonthsVN(from, -1), next: addMonthsVN(from, 1) };
  }
  const span = view === "15" ? 15 : 7;
  return { from: date, to: addDaysVN(date, span), prev: addDaysVN(date, -span), next: addDaysVN(date, span) };
}

function defaultGanttDate(view: SalesView, today: string) {
  if (view === "month") return startOfMonthVN(today);
  return addDaysVN(today, -1);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; origin?: string; focus?: string; view?: string; group?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const manage = can(user.role, "manageSales");
  if (!manage && !can(user.role, "viewRoomChart")) redirect(homePath(user.role));
  const showNames = can(user.role, "viewGuestPii");
  const { date: rawDate, error, origin: rawOrigin, focus: rawFocus, view: rawView, group: rawGroup } = await searchParams;
  const today = todayVN();
  const view = parseView(rawView || "");
  const group = parseGroup(rawGroup || "");
  const hasDate = Boolean(rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate));
  const date = hasDate ? rawDate! : defaultGanttDate(view, today);
  const focusDate = hasDate ? date : today;
  const origin = isSaleOrigin(rawOrigin || "") ? rawOrigin : "";
  const raw = rawFocus || "";
  const focus = isRoomFocus(raw) ? raw : "";
  const { from, to, prev, next } = viewWindow(view, date);
  const [focusBoard, gantt, types] = await Promise.all([roomFocusBoard(focusDate), salesGantt(from, to), listRoomTypes()]);
  const hits = focus ? focusBoard[focus] : [];
  const hitByRoom = new Map(hits.map((hit) => [hit.roomId, hit]));
  const rangeSales = (gantt?.sales || []).filter((sale) => {
    if (origin && sale.origin !== origin) return false;
    if (focus && !hitByRoom.has(sale.roomId)) return false;
    return true;
  });
  const guestLabel = (name: string) => (showNames ? name : maskName(name, user.role));
  const rangeBookings = groupByBooking(rangeSales).map(({ id, rooms }) => ({
    id,
    rooms,
    guestName: guestLabel(rooms[0]?.guestName || ""),
    status: rollupBookingStatus(rooms.map((row) => row.status)),
  }));
  const ganttRows = (gantt?.rows || [])
    .filter((row) => !focus || hitByRoom.has(row.room.id))
    .map((row) => ({
      ...row,
      bars: (origin ? row.bars.filter((bar) => bar.sale.origin === origin) : row.bars).map((bar) => ({
        ...bar,
        sale: { ...bar.sale, guestName: guestLabel(bar.sale.guestName) },
      })),
    }));
  const salesHref = (extra: Record<string, string | undefined>) => {
    const nextQuery = new URLSearchParams();
    const nextView = (extra.view === "" ? "7" : extra.view ?? view) as SalesView;
    const nextDate =
      extra.date ??
      (extra.view !== undefined && extra.view !== view && !hasDate ? defaultGanttDate(parseView(nextView), today) : date);
    if (nextDate !== defaultGanttDate(parseView(nextView), today)) nextQuery.set("date", nextDate);
    const nextOrigin = extra.origin === "" ? "" : extra.origin ?? origin;
    const nextFocus = extra.focus === "" ? "" : extra.focus ?? focus;
    const nextGroup = extra.group === "" ? "floor" : extra.group ?? group;
    if (nextOrigin) nextQuery.set("origin", nextOrigin);
    if (nextFocus) nextQuery.set("focus", nextFocus);
    if (nextView && nextView !== "7") nextQuery.set("view", nextView);
    if (nextGroup && nextGroup !== "floor") nextQuery.set("group", nextGroup);
    const text = nextQuery.toString();
    return text ? `/sales?${text}` : "/sales";
  };
  const lastDay = addDaysVN(to, -1);
  const rangeLabel = view === "month" ? formatMonthLong(date) : `${formatDayMonth(from)} – ${formatDayMonth(lastDay)}`;

  return (
    <main className="sales-board space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h1 className="text-xl font-bold">Sơ đồ phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">
            {manage
              ? "Gantt từ hôm qua. Box booking nửa ngày nhận / nửa ngày trả — cùng ngày có thể ghép khách đi và khách đến. Quản lý booking ở Đặt phòng."
              : "Chỉ xem lịch phòng. Box booking nửa ngày nhận / nửa ngày trả."}
          </p>
        </div>
        {manage ? (
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
          <Link href={`/sales/new?date=${today}`} className="cta-link">
            Bán phòng
          </Link>
          <Link href="/sales/bookings" className="flex min-h-11 items-center text-sm font-semibold text-teal">
            Đặt phòng
          </Link>
          {can(user.role, "manageRooms") ? (
            <Link href="/rooms/manage" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Hạng / giá
            </Link>
          ) : null}
        </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <FilterChip key={item.id} href={salesHref({ view: item.id })} active={view === item.id}>
            {item.label}
          </FilterChip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((item) => (
          <FilterChip key={item.id} href={salesHref({ group: item.id })} active={group === item.id}>
            {item.label}
          </FilterChip>
        ))}
      </div>

      <Card className="md:flex md:items-end md:justify-between md:gap-4">
        <form className="space-y-3 md:flex md:flex-1 md:items-end md:gap-3 md:space-y-0">
          <div className="flex items-end gap-2 md:max-w-sm md:flex-1">
            <Link href={salesHref({ date: prev })} className="hit-btn" aria-label="Khung trước">
              ←
            </Link>
            <div className="min-w-0 flex-1">
              <Field label={view === "month" ? "Tháng sơ đồ" : view === "15" ? "15 ngày sơ đồ" : "7 ngày sơ đồ"}>
                <input type="date" name="date" defaultValue={date} />
              </Field>
            </div>
            <Link href={salesHref({ date: next })} className="hit-btn" aria-label="Khung sau">
              →
            </Link>
          </div>
          {origin ? <input type="hidden" name="origin" value={origin} /> : null}
          {focus ? <input type="hidden" name="focus" value={focus} /> : null}
          {view !== "7" ? <input type="hidden" name="view" value={view} /> : null}
          {group !== "floor" ? <input type="hidden" name="group" value={group} /> : null}
          <Btn type="submit" variant="ghost" className="w-full md:w-auto md:px-6">
            Xem
          </Btn>
        </form>
        <p className="mt-2 text-xs font-semibold text-[#5c6665] md:mt-0 md:pb-3 md:text-sm">{rangeLabel}</p>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <Stat label="Đêm trống" value={gantt?.vacantNights ?? 0} tone="text-[#1b7a4e]" />
        <Stat label="Đêm đã bán" value={gantt?.soldNights ?? 0} />
        <Stat label="OOO" value={gantt?.ooo ?? 0} tone="text-[#c23b3b]" />
        <Stat label="Doanh thu khung" value={formatVnd(gantt?.revenue ?? 0)} />
      </div>

      <div className="space-y-2 md:rounded-2xl md:border md:border-line md:bg-white/70 md:p-3">
        <RoomFocusChips
          path="/sales"
          query={{ date: hasDate ? date : undefined, origin, view: view === "7" ? undefined : view, group: group === "floor" ? undefined : group }}
          date={focusDate}
          focus={focus}
          counts={focusBoard.counts}
        />

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          {Object.entries(KIND_LABEL).map(([key, label]) => (
            <span
              key={key}
              className={`rounded-full border px-2 py-1 ${TILE[key]} ${key === "departed" ? "gantt-legend-departed" : ""}`}
              style={key === "departed" ? { backgroundColor: "#e6e6e6", borderColor: "#cfcfcf" } : undefined}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="tab-scroller -mx-3 px-3 md:mx-0 md:px-0">
          <div className="flex w-max gap-2 md:w-auto md:flex-wrap">
            <FilterChip href={salesHref({ origin: "" })} active={!origin}>
              Tất cả
            </FilterChip>
            <FilterChip href={salesHref({ origin: "ops" })} active={origin === "ops"}>
              Trực tiếp
            </FilterChip>
            <FilterChip href={salesHref({ origin: "ezcloud" })} active={origin === "ezcloud"}>
              OTA
            </FilterChip>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {ganttRows.length ? (
          <RoomGantt
            days={gantt.days}
            today={today}
            rows={ganttRows}
            compact={view === "month"}
            types={types}
            back={salesHref({})}
            group={group}
            readOnly={!manage}
          />
        ) : (
          <Empty title="Không có phòng khớp bộ lọc" text="Bỏ quick filter để xem Gantt." />
        )}
        <Card>
          <h2 className="mb-2 font-bold">Booking trong khung</h2>
          {rangeBookings.length ? (
            <div className="space-y-2">
              {rangeBookings.map((row) => {
                const body = (
                <>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold">
                        {row.guestName} · {row.rooms.length} phòng
                      </span>
                      <ParkingIcons cars={row.rooms[0].cars} bikes={row.rooms[0].bikes} size={14} />
                    </p>
                    <p className="truncate text-xs text-[#5c6665]">
                      {row.rooms[0].checkIn} → {row.rooms[0].checkOut} · {row.rooms.map((sale) => `P.${sale.room?.number}`).join(" · ")} · {SALE_SOURCE_LABEL[row.rooms[0].source as SaleSource] || row.rooms[0].source}
                    </p>
                  </div>
                  <Chip tone={row.status === "inhouse" ? "ok" : row.status === "departed" ? "neutral" : "gold"}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                </>
                );
                const className = "flex min-h-14 items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2.5";
                return manage ? (
                  <Link key={row.id} href={`/sales/bookings/${row.id}`} className={className}>
                    {body}
                  </Link>
                ) : (
                  <div key={row.id} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title={gantt.sales.length ? "Không khớp bộ lọc" : "Chưa có booking trong khung"} text={gantt.sales.length ? "Bỏ lọc nguồn để xem hết chỗ bán." : manage ? "Bấm ô trống trên Gantt để bán." : "Đổi khung ngày để xem booking khác."} />
          )}
        </Card>
      </div>
    </main>
  );
}
