"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { moveGanttSaleAction } from "@/actions/sales";
import { ParkingIcons } from "@/components/parking-icons";
import { WEEKDAYS, addDaysVN, formatDateNumeric, weekdayISO } from "@/lib/datetime";
import { bookingKey, catalogRate, nightsBetween, roomMoveKind } from "@/lib/sales";
import { GanttUpgradeDialog } from "./dialog";
import { BAR, DRAG_PX, ganttSections, quoteTotal, rangeOpen, saleTitle, type ConfirmState, type DragState, type GanttGroup, type GanttRow, type GanttSale, type Hover, type RoomType } from "./model";

export function RoomGantt({
  days,
  today,
  rows,
  compact,
  types,
  back,
  group = "floor",
}: {
  days: string[];
  today: string;
  rows: GanttRow[];
  compact?: boolean;
  types: RoomType[];
  back: string;
  group?: GanttGroup;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const sections = ganttSections(rows, types, group);
  const columns = `4.75rem repeat(${days.length}, minmax(${compact ? "1.85rem" : "2.85rem"}, 1fr))`;
  const cellMin = compact ? "1.85rem" : "2.85rem";

  function roomOf(id: string) {
    return rows.find((row) => row.room.id === id)?.room;
  }

  function hitAt(clientX: number, clientY: number): Hover | null {
    const tracks = rootRef.current?.querySelectorAll<HTMLElement>("[data-gantt-track]");
    if (!tracks?.length) return null;
    for (const track of tracks) {
      const box = track.getBoundingClientRect();
      if (clientY < box.top || clientY > box.bottom) continue;
      const col = Math.floor(((clientX - box.left) / box.width) * days.length);
      return { roomId: track.dataset.roomId || "", start: Math.max(0, Math.min(days.length - 1, col)) };
    }
    return null;
  }

  function submitMove(sale: GanttSale, roomId: string, checkIn: string, checkOut: string) {
    const data = new FormData();
    data.set("saleId", sale.id);
    data.set("roomId", roomId);
    data.set("checkIn", checkIn);
    data.set("checkOut", checkOut);
    data.set("back", back);
    startTransition(() => {
      moveGanttSaleAction(data);
    });
  }

  function applyDrop(sale: GanttSale, fromRoomId: string, nights: number, hover: Hover) {
    const target = rows.find((row) => row.room.id === hover.roomId);
    const from = roomOf(fromRoomId);
    if (!target || !from) return;
    const checkIn = sale.status === "inhouse" ? sale.checkIn : addDaysVN(days[0], hover.start);
    const checkOut = sale.status === "inhouse" ? sale.checkOut : addDaysVN(checkIn, nights);
    if (target.room.id === fromRoomId && checkIn === sale.checkIn && checkOut === sale.checkOut) return;
    if (sale.status === "inhouse" && checkIn !== sale.checkIn) {
      setNotice("Khách đang ở — chỉ kéo sang phòng trống cùng ngày nhận.");
      return;
    }
    if (hover.start >= 0 && hover.start + nights <= days.length && !rangeOpen(target, hover.start, nights, sale.id, days.length)) {
      setNotice(`P.${target.room.number} không trống ${formatDateNumeric(checkIn)} → ${formatDateNumeric(checkOut)}.`);
      return;
    }
    const kind = roomMoveKind(from.type, target.room.type, types);
    if (!kind) {
      setNotice(`P.${target.room.number} (${target.room.type}) không cùng hạng và không phải nâng hạng so với ${from.type}.`);
      return;
    }
    const nextRate =
      kind === "upgrade" ? catalogRate(types.find((type) => type.name === target.room.type), checkIn) || sale.rate : sale.rate;
    const extra = quoteTotal(sale, nextRate, checkIn, checkOut) - quoteTotal(sale, sale.rate, sale.checkIn, sale.checkOut);
    if (kind === "upgrade") {
      setConfirm({ sale, room: target.room, checkIn, checkOut, extra });
      return;
    }
    submitMove(sale, target.room.id, checkIn, checkOut);
  }

  function onBarDown(event: ReactPointerEvent<HTMLButtonElement>, sale: GanttSale, fromRoomId: string, nightStart: number, visualStart: number, visualEnd: number) {
    if (event.button !== 0 || pending) return;
    event.preventDefault();
    const bar = event.currentTarget;
    const box = bar.getBoundingClientRect();
    const nights = Math.max(1, nightsBetween(sale.checkIn, sale.checkOut));
    const visual = Math.max(0.5, visualEnd - visualStart);
    const grab = Math.max(0, Math.min(nights - 1, Math.floor(((event.clientX - box.left) / Math.max(1, box.width)) * visual)));
    bar.setPointerCapture(event.pointerId);
    setNotice("");
    setDrag({
      sale,
      fromRoomId,
      fromStart: nightStart,
      nights,
      grab,
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
      moved: false,
      hover: { roomId: fromRoomId, start: nightStart },
    });
  }

  function onBarMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const moved = drag.moved || Math.hypot(dx, dy) >= DRAG_PX;
    const raw = hitAt(event.clientX, event.clientY);
    const hover = raw
      ? {
          roomId: raw.roomId,
          start: drag.sale.status === "inhouse" ? drag.fromStart : raw.start - drag.grab,
        }
      : drag.hover;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved, hover });
  }

  function onBarUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const next = drag;
    setDrag(null);
    if (!next.moved) {
      router.push(`/sales/bookings/${bookingKey(next.sale)}`);
      return;
    }
    if (next.hover) applyDrop(next.sale, next.fromRoomId, next.nights, next.hover);
  }

  return (
    <div ref={rootRef} className={`room-gantt-scroll ${drag ? "is-dragging" : ""} ${pending ? "is-pending" : ""}`}>
      <p className="mb-2 text-xs text-[#5c6665]">Kéo tên khách sang phòng trống hoặc ngày khác. Nâng hạng sẽ hỏi trước khi cộng phải thu.</p>
      {notice ? <p className="mb-2 text-sm text-[#c23b3b]">{notice}</p> : null}
      <div className={`room-gantt ${compact ? "is-month" : ""}`} style={{ minWidth: `calc(4.75rem + ${days.length} * ${cellMin})` }}>
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

        {sections.map((section) => {
          if (!section.rows.length) return null;
          return (
            <section key={section.key}>
              <p className="room-gantt-floor">{section.label}</p>
              {section.rows.map((row) => {
                const occupied = new Set<number>();
                for (const bar of row.bars) {
                  for (let i = bar.nightStart; i < bar.nightEnd; i += 1) occupied.add(i);
                }
                const drop =
                  drag?.hover?.roomId === row.room.id
                    ? {
                        start: drag.hover.start + 0.5,
                        end: drag.hover.start + drag.nights + 0.5,
                      }
                    : null;
                const dropOk = drop ? rangeOpen(row, drop.start, drag?.nights || 0, drag?.sale.id || "", days.length) : false;
                return (
                  <div key={row.room.id} className="room-gantt-row" style={{ gridTemplateColumns: columns }}>
                    <div className="room-gantt-label">
                      <p className="text-sm font-bold leading-tight">P.{row.room.number}</p>
                      <p className="truncate text-[10px] text-[#8a7a72]">
                        {group === "type" ? `Tầng ${row.room.floor}` : row.room.type}
                      </p>
                    </div>
                    <div className="room-gantt-track" data-gantt-track data-room-id={row.room.id} style={{ gridColumn: `2 / span ${days.length}` }}>
                      <div className="room-gantt-cells" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                        {days.map((day, index) => {
                          const weekend = weekdayISO(day) >= 5;
                          const isDrop = Boolean(drop && index + 1 > drop.start && index < drop.end);
                          if (row.room.opsStatus === "ooo") {
                            return <div key={day} className="room-gantt-cell is-ooo" title="OOO" />;
                          }
                          if (occupied.has(index) && !(drag && drag.sale.id && row.bars.some((bar) => bar.sale.id === drag.sale.id && index >= bar.nightStart && index < bar.nightEnd))) {
                            return (
                              <div
                                key={day}
                                className={`room-gantt-cell ${isDrop ? (dropOk ? "is-drop" : "is-drop-bad") : ""} ${day === today ? "is-today" : weekend ? "is-weekend" : ""}`}
                              />
                            );
                          }
                          return (
                            <a
                              key={day}
                              href={`/sales/new?room=${row.room.id}&date=${day}`}
                              className={`room-gantt-cell is-open ${isDrop ? (dropOk ? "is-drop" : "is-drop-bad") : ""} ${day === today ? "is-today" : weekend ? "is-weekend" : ""}`}
                              title={`Bán P.${row.room.number} · ${day}`}
                            />
                          );
                        })}
                      </div>
                      {row.bars.map((bar) => {
                        const tone = bar.sale.status === "inhouse" ? "inhouse" : "reserved";
                        const dragging = drag?.sale.id === bar.sale.id;
                        const span = Math.max(0.5, bar.end - bar.start);
                        return (
                          <button
                            key={bar.sale.id}
                            type="button"
                            className={`room-gantt-bar ${BAR[tone]} ${dragging ? "is-dragging" : ""}`}
                            style={{
                              left: `calc(${(bar.start / days.length) * 100}% + 1px)`,
                              width: `calc(${(span / days.length) * 100}% - 2px)`,
                            }}
                            title={saleTitle(bar.sale)}
                            onPointerDown={(event) => onBarDown(event, bar.sale, row.room.id, bar.nightStart, bar.start, bar.end)}
                            onPointerMove={onBarMove}
                            onPointerUp={onBarUp}
                            onPointerCancel={() => setDrag(null)}
                            disabled={pending}
                          >
                            <span className="min-w-0 truncate">{bar.sale.guestName}</span>
                            <ParkingIcons cars={bar.sale.cars} bikes={bar.sale.bikes} size={compact ? 10 : 12} />
                          </button>
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

      {drag?.moved ? (
        <div
          className={`room-gantt-ghost ${BAR[drag.sale.status === "inhouse" ? "inhouse" : "reserved"]}`}
          style={{
            width: drag.width,
            height: drag.height,
            left: drag.x - drag.width / 2,
            top: drag.y - drag.height / 2,
          }}
        >
          <span className="min-w-0 truncate">{drag.sale.guestName}</span>
          <ParkingIcons cars={drag.sale.cars} bikes={drag.sale.bikes} />
        </div>
      ) : null}

      {confirm ? (
        <GanttUpgradeDialog
          confirm={confirm}
          pending={pending}
          roomOf={roomOf}
          onCancel={() => setConfirm(null)}
          onConfirm={(sale, roomId, checkIn, checkOut) => {
            setConfirm(null);
            submitMove(sale, roomId, checkIn, checkOut);
          }}
        />
      ) : null}
    </div>
  );
}

