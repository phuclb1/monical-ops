import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, Stat, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import {
  addDaysVN,
  addMonthsVN,
  formatDateLong,
  formatMonthLong,
  formatWeekRange,
  nextDate,
  prevDate,
  startOfMonthVN,
  startOfWeekVN,
  todayVN,
} from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { salesBoard, salesGantt, roomFocusBoard } from "@/lib/repos";
import { formatVnd, groupByBooking, isSaleOrigin } from "@/lib/sales";
import { isRoomFocus } from "@/lib/room-focus";
import { RoomFocusChips } from "@/components/room-focus-chips";
import { RoomGantt } from "@/components/room-gantt";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  vacant: "Trống",
  reserved: "Đã giữ",
  inhouse: "Đang ở",
  ooo: "OOO",
};

const TILE: Record<string, string> = {
  vacant: "border-line bg-white",
  reserved: "border-[#e8c9a0] bg-[#fff8ea]",
  inhouse: "border-[#c9e6e4] bg-[#e8f3f2]",
  ooo: "border-[#f1c7c7] bg-[#fde8e8]",
};

const VIEWS = [
  { id: "day", label: "Ngày" },
  { id: "week", label: "Tuần" },
  { id: "month", label: "Tháng" },
] as const;

type SalesView = (typeof VIEWS)[number]["id"];

function isSalesView(value: string): value is SalesView {
  return VIEWS.some((view) => view.id === value);
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

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; origin?: string; focus?: string; view?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { date: rawDate, error, origin: rawOrigin, focus: rawFocus, view: rawView } = await searchParams;
  const today = todayVN();
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const origin = isSaleOrigin(rawOrigin || "") ? rawOrigin : "";
  const raw = rawFocus || "";
  const focus = isRoomFocus(raw) ? raw : "";
  const view: SalesView = isSalesView(rawView || "") ? (rawView as SalesView) : "day";
  const from = view === "week" ? startOfWeekVN(date) : view === "month" ? startOfMonthVN(date) : date;
  const to = view === "week" ? addDaysVN(from, 7) : view === "month" ? addMonthsVN(from, 1) : nextDate(date);
  const prev = view === "week" ? addDaysVN(from, -7) : view === "month" ? addMonthsVN(from, -1) : prevDate(date);
  const next = view === "week" ? addDaysVN(from, 7) : view === "month" ? addMonthsVN(from, 1) : nextDate(date);
  const [board, focusBoard, gantt] = await Promise.all([
    salesBoard(date),
    roomFocusBoard(date),
    view === "day" ? Promise.resolve(null) : salesGantt(from, to),
  ]);
  const hits = focus ? focusBoard[focus] : [];
  const hitByRoom = new Map(hits.map((hit) => [hit.roomId, hit]));
  const floors = [...new Set(board.cells.map((cell) => cell.room.floor))].sort((a, b) => a - b);
  const shownCells = focus ? board.cells.filter((cell) => hitByRoom.has(cell.room.id)) : board.cells;
  const nightSales = board.nightSales.filter((sale) => {
    if (origin && sale.origin !== origin) return false;
    if (focus && !hitByRoom.has(sale.roomId)) return false;
    return true;
  });
  const upcoming = board.upcoming.filter((sale) => {
    if (origin && sale.origin !== origin) return false;
    if (focus === "booking") return hitByRoom.has(sale.roomId);
    if (focus) return false;
    return true;
  });
  const nightBookings = groupByBooking(nightSales).map(({ id, rooms }) => ({
    id,
    rooms,
    guestName: rooms[0]?.guestName || "",
    status: rooms.some((row) => row.status === "inhouse") ? "inhouse" : "reserved",
  }));
  const rangeSales = (gantt?.sales || []).filter((sale) => {
    if (origin && sale.origin !== origin) return false;
    if (focus && !hitByRoom.has(sale.roomId)) return false;
    return true;
  });
  const rangeBookings = groupByBooking(rangeSales).map(({ id, rooms }) => ({
    id,
    rooms,
    guestName: rooms[0]?.guestName || "",
    status: rooms.some((row) => row.status === "inhouse") ? "inhouse" : "reserved",
  }));
  const ganttRows = (gantt?.rows || [])
    .filter((row) => !focus || hitByRoom.has(row.room.id))
    .map((row) => ({
      ...row,
      bars: origin ? row.bars.filter((bar) => bar.sale.origin === origin) : row.bars,
    }));
  const upcomingBookings = groupByBooking(upcoming);
  const listBookings = view === "day" ? nightBookings : rangeBookings;
  const salesHref = (extra: Record<string, string | undefined>) => {
    const nextQuery = new URLSearchParams();
    nextQuery.set("date", extra.date ?? date);
    const nextOrigin = extra.origin === "" ? "" : extra.origin ?? origin;
    const nextFocus = extra.focus === "" ? "" : extra.focus ?? focus;
    const nextView = extra.view === "" ? "day" : extra.view ?? view;
    if (nextOrigin) nextQuery.set("origin", nextOrigin);
    if (nextFocus) nextQuery.set("focus", nextFocus);
    if (nextView && nextView !== "day") nextQuery.set("view", nextView);
    return `/sales?${nextQuery.toString()}`;
  };
  const rangeLabel =
    view === "week" ? `Tuần ${formatWeekRange(date)}` : view === "month" ? formatMonthLong(date) : formatDateLong(date);

  return (
    <main className="sales-board space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h1 className="text-xl font-bold">Bán phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">Sơ đồ ngày, Gantt tuần / tháng. Quản lý booking ở Đặt phòng.</p>
        </div>
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
          <Link href={`/sales/new?date=${date}`} className="cta-link">
            Bán phòng
          </Link>
          <Link href="/sales/bookings" className="flex min-h-11 items-center text-sm font-semibold text-teal">
            Đặt phòng
          </Link>
          {can(user.role, "manageRates") ? (
            <Link href="/sales/rates" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Giá phòng
            </Link>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((item) => (
          <FilterChip key={item.id} href={salesHref({ view: item.id })} active={view === item.id}>
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
              <Field label={view === "month" ? "Tháng sơ đồ" : view === "week" ? "Tuần sơ đồ" : "Ngày sơ đồ"}>
                <input type="date" name="date" defaultValue={date} />
              </Field>
            </div>
            <Link href={salesHref({ date: next })} className="hit-btn" aria-label="Khung sau">
              →
            </Link>
          </div>
          {origin ? <input type="hidden" name="origin" value={origin} /> : null}
          {focus ? <input type="hidden" name="focus" value={focus} /> : null}
          {view !== "day" ? <input type="hidden" name="view" value={view} /> : null}
          <Btn type="submit" variant="ghost" className="w-full md:w-auto md:px-6">
            Xem
          </Btn>
        </form>
        <p className="mt-2 text-xs font-semibold text-[#5c6665] md:mt-0 md:pb-3 md:text-sm">{rangeLabel}</p>
      </Card>

      {view === "day" ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
          <Stat label="Trống" value={board.vacant} tone="text-[#1b7a4e]" />
          <Stat label="Đã bán" value={board.sold} />
          <Stat label="Đang ở" value={board.inhouse} tone="text-teal" />
          <Stat label="OOO" value={board.ooo} tone="text-[#c23b3b]" />
          <Stat label="Doanh thu đêm" value={formatVnd(board.revenue)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <Stat label="Đêm trống" value={gantt?.vacantNights ?? 0} tone="text-[#1b7a4e]" />
          <Stat label="Đêm đã bán" value={gantt?.soldNights ?? 0} />
          <Stat label="OOO" value={gantt?.ooo ?? 0} tone="text-[#c23b3b]" />
          <Stat label="Doanh thu khung" value={formatVnd(gantt?.revenue ?? 0)} />
        </div>
      )}

      <div className="space-y-2 md:rounded-2xl md:border md:border-line md:bg-white/70 md:p-3">
        <RoomFocusChips
          path="/sales"
          query={{ date, origin, view: view === "day" ? undefined : view }}
          date={date}
          focus={focus}
          counts={focusBoard.counts}
        />

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          {Object.entries(KIND_LABEL).map(([key, label]) => (
            <span key={key} className={`rounded-full border px-2 py-1 ${TILE[key]}`}>
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
              Ops
            </FilterChip>
            <FilterChip href={salesHref({ origin: "ezcloud" })} active={origin === "ezcloud"}>
              ezCloud
            </FilterChip>
          </div>
        </div>
      </div>

      {view !== "day" && gantt ? (
        <div className="space-y-3">
          {ganttRows.length ? (
            <RoomGantt days={gantt.days} today={today} rows={ganttRows} compact={view === "month"} />
          ) : (
            <Empty title="Không có phòng khớp bộ lọc" text="Bỏ quick filter để xem Gantt." />
          )}
          <Card>
            <h2 className="mb-2 font-bold">Booking trong khung</h2>
            {listBookings.length ? (
              <div className="space-y-2">
                {listBookings.map((row) => (
                  <Link key={row.id} href={`/sales/bookings/${row.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {row.guestName} · {row.rooms.length} phòng
                      </p>
                      <p className="truncate text-xs text-[#5c6665]">
                        {row.rooms[0].checkIn} → {row.rooms[0].checkOut} · {row.rooms.map((sale) => `P.${sale.room?.number}`).join(" · ")}
                      </p>
                    </div>
                    <Chip tone={row.status === "inhouse" ? "ok" : "gold"}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="Chưa có booking trong khung" text="Bấm ô trống trên Gantt để bán." />
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-3">
            {floors.map((floor) => {
              const onFloor = shownCells.filter((cell) => cell.room.floor === floor);
              if (!onFloor.length) return null;
              return (
                <section key={floor} className="space-y-2 md:rounded-2xl md:border md:border-line md:bg-white/80 md:p-3">
                  <h2 className="text-sm font-bold text-[#5c6665]">Tầng {floor}</h2>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8">
                    {onFloor.map((cell) => {
                      const hit = hitByRoom.get(cell.room.id);
                      const href = cell.sale
                        ? `/sales/${cell.sale.id}`
                        : hit?.href
                          ? hit.href
                          : cell.kind === "ooo"
                            ? `/rooms/${cell.room.id}`
                            : `/sales/new?room=${cell.room.id}&date=${date}`;
                      return (
                        <Link key={cell.room.id} href={href} className={`flex min-h-[5.75rem] flex-col justify-between rounded-2xl border px-3 py-3 md:min-h-[6.5rem] ${TILE[cell.kind]}`}>
                          <p className="text-base font-bold">P.{cell.room.number}</p>
                          <p className="truncate text-xs text-[#5c6665]">{cell.room.type}</p>
                          <p className="truncate text-xs font-semibold">
                            {hit?.guestName || cell.sale?.guestName || (cell.kind === "ooo" ? "Ngừng bán" : hit?.hint || "Trống — bán")}
                          </p>
                          {hit?.hint ? <p className="truncate text-[11px] text-[#8a7a72]">{hit.hint}</p> : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {focus && !shownCells.length ? <Empty title="Không có phòng khớp bộ lọc" text="Bỏ quick filter để xem hết sơ đồ." /> : null}
          </div>

          <aside className="space-y-3 md:sticky md:top-[4.75rem]">
            <Card>
              <h2 className="mb-2 font-bold">Đêm {formatDateLong(date)}</h2>
              {nightBookings.length ? (
                <div className="space-y-2">
                  {nightBookings.map((row) => (
                    <Link key={row.id} href={`/sales/bookings/${row.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {row.guestName} · {row.rooms.length} phòng
                        </p>
                        <p className="truncate text-xs text-[#5c6665]">
                          {row.rooms.map((sale) => `P.${sale.room?.number}`).join(" · ")} · {SALE_SOURCE_LABEL[row.rooms[0].source as SaleSource] || row.rooms[0].source}
                        </p>
                      </div>
                      <Chip tone={row.status === "inhouse" ? "ok" : "gold"}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty title={board.nightSales.length ? "Không khớp bộ lọc" : "Chưa bán đêm này"} text={board.nightSales.length ? "Bỏ lọc nguồn để xem hết chỗ bán." : "Bấm phòng trống trên sơ đồ để bán."} />
              )}
            </Card>

            {upcomingBookings.length ? (
              <Card>
                <h2 className="mb-2 font-bold">Giữ chỗ 14 ngày tới</h2>
                <div className="space-y-1">
                  {upcomingBookings.map(({ id, rooms }) => (
                    <Link key={id} href={`/sales/bookings/${id}`} className="block min-h-11 rounded-lg px-1 py-1.5 text-sm hover:bg-sand">
                      {rooms[0].checkIn} · {rooms.map((sale) => `P.${sale.room?.number}`).join(", ")} · {rooms[0].guestName}
                    </Link>
                  ))}
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}
