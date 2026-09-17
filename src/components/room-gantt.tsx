"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { moveGanttSaleAction } from "@/actions/sales";
import { Btn } from "@/components/ui";
import { WEEKDAYS, addDaysVN, formatDateNumeric, weekdayISO } from "@/lib/datetime";
import { bookingKey, bookingQuote, catalogRate, formatVnd, nightsBetween, roomMoveKind } from "@/lib/sales";

const BAR: Record<string, string> = {
  reserved: "bg-[#fff1d2] text-[#8a6a22] ring-1 ring-[#e8c9a0]",
  inhouse: "bg-[#dceeee] text-[#0f4c4c] ring-1 ring-[#c9e6e4]",
};

const DRAG_PX = 8;

type GanttSale = {
  id: string;
  bookingId?: string | null;
  roomId: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  breakfast?: boolean | null;
  discountKind?: string | null;
  discountValue?: number | null;
};

type GanttRow = {
  room: { id: string; number: string; type: string; floor: number; opsStatus: string };
  bars: { sale: GanttSale; start: number; end: number }[];
};

type RoomType = { name: string; sortOrder: number; baseRate: number; weekendRate: number };

type Hover = { roomId: string; start: number };

type DragState = {
  sale: GanttSale;
  fromRoomId: string;
  fromStart: number;
  nights: number;
  grab: number;
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  hover: Hover | null;
};

type ConfirmState = {
  sale: GanttSale;
  room: GanttRow["room"];
  checkIn: string;
  checkOut: string;
  extra: number;
};

function quoteTotal(sale: GanttSale, rate: number, checkIn: string, checkOut: string) {
  return bookingQuote([
    {
      rate,
      checkIn,
      checkOut,
      breakfast: sale.breakfast,
      discountKind: sale.discountKind,
      discountValue: sale.discountValue,
    },
  ]).total;
}

function rangeOpen(row: GanttRow, start: number, nights: number, exceptId: string, dayCount: number) {
  if (row.room.opsStatus === "ooo") return false;
  if (nights < 1) return false;
  const end = start + nights;
  for (const bar of row.bars) {
    if (bar.sale.id === exceptId) continue;
    const a = Math.max(0, bar.start);
    const b = Math.min(dayCount, bar.end);
    if (start < b && end > a) return false;
  }
  return true;
}

export function RoomGantt({
  days,
  today,
  rows,
  compact,
  types,
  back,
}: {
  days: string[];
  today: string;
  rows: GanttRow[];
  compact?: boolean;
  types: RoomType[];
  back: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const floors = [...new Set(rows.map((row) => row.room.floor))].sort((a, b) => a - b);
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

  function onBarDown(event: ReactPointerEvent<HTMLButtonElement>, sale: GanttSale, fromRoomId: string, start: number, end: number) {
    if (event.button !== 0 || pending) return;
    event.preventDefault();
    const bar = event.currentTarget;
    const box = bar.getBoundingClientRect();
    const nights = Math.max(1, end - start, nightsBetween(sale.checkIn, sale.checkOut));
    const grab = Math.max(0, Math.min(nights - 1, Math.floor(((event.clientX - box.left) / Math.max(1, box.width)) * nights)));
    bar.setPointerCapture(event.pointerId);
    setNotice("");
    setDrag({
      sale,
      fromRoomId,
      fromStart: start,
      nights,
      grab,
      x: event.clientX,
      y: event.clientY,
      width: box.width,
      height: box.height,
      moved: false,
      hover: { roomId: fromRoomId, start },
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
                const drop =
                  drag?.hover?.roomId === row.room.id
                    ? { start: drag.hover.start, end: drag.hover.start + drag.nights }
                    : null;
                const dropOk = drop ? rangeOpen(row, drop.start, drag?.nights || 0, drag?.sale.id || "", days.length) : false;
                return (
                  <div key={row.room.id} className="room-gantt-row" style={{ gridTemplateColumns: columns }}>
                    <div className="room-gantt-label">
                      <p className="text-sm font-bold leading-tight">P.{row.room.number}</p>
                      <p className="truncate text-[10px] text-[#8a7a72]">{row.room.type}</p>
                    </div>
                    <div className="room-gantt-track" data-gantt-track data-room-id={row.room.id} style={{ gridColumn: `2 / span ${days.length}` }}>
                      <div className="room-gantt-cells" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                        {days.map((day, index) => {
                          const weekend = weekdayISO(day) >= 5;
                          const isDrop = Boolean(drop && index >= drop.start && index < drop.end);
                          if (row.room.opsStatus === "ooo") {
                            return <div key={day} className="room-gantt-cell is-ooo" title="OOO" />;
                          }
                          if (occupied.has(index) && !(drag && drag.sale.id && row.bars.some((bar) => bar.sale.id === drag.sale.id && index >= bar.start && index < bar.end))) {
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
                        const nights = bar.end - bar.start;
                        const tone = bar.sale.status === "inhouse" ? "inhouse" : "reserved";
                        const dragging = drag?.sale.id === bar.sale.id;
                        return (
                          <button
                            key={bar.sale.id}
                            type="button"
                            className={`room-gantt-bar ${BAR[tone]} ${dragging ? "is-dragging" : ""}`}
                            style={{
                              left: `calc(${(bar.start / days.length) * 100}% + 2px)`,
                              width: `calc(${(nights / days.length) * 100}% - 4px)`,
                            }}
                            title={`${bar.sale.guestName} · ${bar.sale.checkIn} → ${bar.sale.checkOut} — kéo để đổi phòng / ngày`}
                            onPointerDown={(event) => onBarDown(event, bar.sale, row.room.id, bar.start, bar.end)}
                            onPointerMove={onBarMove}
                            onPointerUp={onBarUp}
                            onPointerCancel={() => setDrag(null)}
                            disabled={pending}
                          >
                            <span className="truncate">{bar.sale.guestName}</span>
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
          <span className="truncate">{drag.sale.guestName}</span>
        </div>
      ) : null}

      {confirm ? (
        <div className="gantt-dialog-back" role="dialog" aria-modal="true">
          <div className="gantt-dialog card p-4">
            <h2 className="font-bold">Nâng hạng phòng</h2>
            <p className="mt-2 text-sm">
              {roomOf(confirm.sale.roomId)?.type || "—"} P.{roomOf(confirm.sale.roomId)?.number} → {confirm.room.type} P.
              {confirm.room.number}
            </p>
            <p className="mt-1 text-sm text-[#5c6665]">
              {formatDateNumeric(confirm.checkIn)} → {formatDateNumeric(confirm.checkOut)} · {nightsBetween(confirm.checkIn, confirm.checkOut)} đêm
            </p>
            {confirm.extra > 0 ? (
              <p className="mt-2 text-sm font-semibold">Phải thu thêm {formatVnd(confirm.extra)}</p>
            ) : (
              <p className="mt-2 text-sm text-[#5c6665]">Giá không tăng — chỉ đổi hạng.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn type="button" variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
                Hủy
              </Btn>
              <Btn
                type="button"
                onClick={() => {
                  const next = confirm;
                  setConfirm(null);
                  submitMove(next.sale, next.room.id, next.checkIn, next.checkOut);
                }}
                disabled={pending}
              >
                Đồng ý
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
