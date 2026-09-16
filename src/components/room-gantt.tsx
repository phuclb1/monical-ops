import Link from "next/link";
import { WEEKDAYS, weekdayISO } from "@/lib/datetime";
import { bookingKey } from "@/lib/sales";

const BAR: Record<string, string> = {
  reserved: "bg-[#fff1d2] text-[#8a6a22] ring-1 ring-[#e8c9a0]",
  inhouse: "bg-[#dceeee] text-[#0f4c4c] ring-1 ring-[#c9e6e4]",
};

type GanttSale = {
  id: string;
  bookingId?: string | null;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
};

type GanttRow = {
  room: { id: string; number: string; type: string; floor: number; opsStatus: string };
  bars: { sale: GanttSale; start: number; end: number }[];
};

export function RoomGantt({
  days,
  today,
  rows,
  compact,
}: {
  days: string[];
  today: string;
  rows: GanttRow[];
  compact?: boolean;
}) {
  const floors = [...new Set(rows.map((row) => row.room.floor))].sort((a, b) => a - b);
  const columns = `4.75rem repeat(${days.length}, minmax(${compact ? "1.85rem" : "2.85rem"}, 1fr))`;

  return (
    <div className="room-gantt-scroll">
      <div className={`room-gantt ${compact ? "is-month" : ""}`} style={{ minWidth: `calc(4.75rem + ${days.length} * ${compact ? "1.85rem" : "2.85rem"})` }}>
        <div className="room-gantt-head" style={{ gridTemplateColumns: columns }}>
          <div className="room-gantt-label text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">Phòng</div>
          {days.map((day) => {
            const weekday = WEEKDAYS[weekdayISO(day) - 1];
            const weekend = weekdayISO(day) >= 5;
            return (
              <div
                key={day}
                className={`px-0.5 py-1 text-center ${day === today ? "bg-[#f7edd2]" : weekend ? "bg-[#f7efe4]" : ""}`}
              >
                <p className="text-[10px] font-bold text-[#8a7a72]">{weekday?.short}</p>
                <p className={`text-xs font-bold ${day === today ? "text-teal" : ""}`}>{Number(day.slice(8))}</p>
              </div>
            );
          })}
        </div>

        {floors.map((floor) => {
          const onFloor = rows.filter((row) => row.room.floor === floor);
          if (!onFloor.length) return null;
          return (
            <section key={floor}>
              <p className="room-gantt-floor">Tầng {floor}</p>
              {onFloor.map((row) => {
                const occupied = new Set<number>();
                for (const bar of row.bars) {
                  for (let i = bar.start; i < bar.end; i += 1) occupied.add(i);
                }
                return (
                  <div key={row.room.id} className="room-gantt-row" style={{ gridTemplateColumns: columns }}>
                    <div className="room-gantt-label">
                      <p className="text-sm font-bold leading-tight">P.{row.room.number}</p>
                      <p className="truncate text-[10px] text-[#8a7a72]">{row.room.type}</p>
                    </div>
                    <div className="room-gantt-track" style={{ gridColumn: `2 / span ${days.length}` }}>
                      <div className="room-gantt-cells" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                        {days.map((day, index) => {
                          const weekend = weekdayISO(day) >= 5;
                          if (row.room.opsStatus === "ooo") {
                            return <div key={day} className="room-gantt-cell is-ooo" title="OOO" />;
                          }
                          if (occupied.has(index)) {
                            return (
                              <div
                                key={day}
                                className={`room-gantt-cell ${day === today ? "is-today" : weekend ? "is-weekend" : ""}`}
                              />
                            );
                          }
                          return (
                            <Link
                              key={day}
                              href={`/sales/new?room=${row.room.id}&date=${day}`}
                              className={`room-gantt-cell is-open ${day === today ? "is-today" : weekend ? "is-weekend" : ""}`}
                              title={`Bán P.${row.room.number} · ${day}`}
                            />
                          );
                        })}
                      </div>
                      {row.bars.map((bar) => {
                        const nights = bar.end - bar.start;
                        const tone = bar.sale.status === "inhouse" ? "inhouse" : "reserved";
                        return (
                          <Link
                            key={bar.sale.id}
                            href={`/sales/bookings/${bookingKey(bar.sale)}`}
                            className={`room-gantt-bar ${BAR[tone]}`}
                            style={{
                              left: `calc(${(bar.start / days.length) * 100}% + 2px)`,
                              width: `calc(${(nights / days.length) * 100}% - 4px)`,
                            }}
                            title={`${bar.sale.guestName} · ${bar.sale.checkIn} → ${bar.sale.checkOut}`}
                          >
                            <span className="truncate">{bar.sale.guestName}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
