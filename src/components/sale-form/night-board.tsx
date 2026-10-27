"use client";

import { WEEKDAYS, formatDayMonth, weekdayISO } from "@/lib/datetime";
import { groupRoomsByType, type NightPicks, type RoomAvailabilityRow, type RoomType, type StaySegment } from "./shared";

export function NightBoard({
  grid,
  types,
  query,
  setQuery,
  picked,
  onToggleNight,
  onToggleStay,
  segments,
  saveHint,
}: {
  grid: RoomAvailabilityRow[];
  types: RoomType[];
  query: string;
  setQuery: (value: string) => void;
  picked: NightPicks;
  onToggleNight: (roomId: string, date: string) => void;
  onToggleStay: (roomId: string) => void;
  segments: StaySegment[];
  saveHint?: string;
}) {
  const nights = grid[0]?.nights.map((night) => night.date) || [];
  const q = query.trim().toLowerCase();
  const visible = grid.filter((row) => {
    if (!row.nights.some((night) => night.available)) return false;
    if (!q) return true;
    return `p.${row.number} ${row.number} ${row.type}`.toLowerCase().includes(q);
  });
  const byId = new Map(visible.map((row) => [row.roomId, row]));
  const groups = groupRoomsByType(
    visible.map((row) => ({ id: row.roomId, number: row.number, type: row.type })),
    types,
  );
  const numberOf = new Map(grid.map((row) => [row.roomId, row.number]));

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-[#5c6665]">
        Phòng trống theo đêm · {visible.length} phòng
      </p>
      <p className="mb-2 text-xs text-[#5c6665]">
        Bấm ô trống để gán phòng cho đêm đó. Các đêm liền nhau của cùng một phòng thành một chặng.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng / số phòng" />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#5c6665]">
        <span className="inline-flex items-center gap-1"><span className="night-swatch is-on" /> Đã gán</span>
        <span className="inline-flex items-center gap-1"><span className="night-swatch" /> Trống</span>
        <span className="inline-flex items-center gap-1"><span className="night-swatch is-off" /> Đã bán</span>
      </div>
      {nights.length ? (
        <div className="night-board mt-2">
          <table>
            <thead>
              <tr>
                <th className="night-room">Phòng</th>
                {nights.map((date) => {
                  const dow = WEEKDAYS.find((day) => day.iso === weekdayISO(date));
                  return (
                    <th key={date}>
                      <span className="block">{dow?.short}</span>
                      <span className="block">{formatDayMonth(date)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups.length ? (
              groups.map((group) => (
                <tbody key={group.type}>
                  <tr className="night-type-row">
                    <th className="night-room" colSpan={nights.length + 1}>{group.type}</th>
                  </tr>
                  {group.rooms.map((room) => {
                    const row = byId.get(room.id);
                    if (!row) return null;
                    const selected = picked[room.id] || [];
                    const allFree = row.nights.every((night) => night.available);
                    const allOn = allFree && selected.length === row.nights.length;
                    return (
                      <tr key={room.id}>
                        <th className="night-room">
                          <span className="block text-sm font-semibold">P.{room.number}</span>
                          {allFree ? (
                            <button type="button" className="night-stay" onClick={() => onToggleStay(room.id)}>
                              {allOn ? "Bỏ cả kỳ" : "Cả kỳ"}
                            </button>
                          ) : null}
                        </th>
                        {row.nights.map((night) => {
                          const on = selected.includes(night.date);
                          const dow = WEEKDAYS.find((day) => day.iso === weekdayISO(night.date));
                          return (
                            <td key={night.date}>
                              <button
                                type="button"
                                className={`night-cell${on ? " is-on" : ""}`}
                                disabled={!night.available}
                                aria-pressed={on}
                                aria-label={`P.${room.number} ${formatDayMonth(night.date)} ${on ? "đã gán" : night.available ? "trống" : "đã bán"}`}
                                onClick={() => onToggleNight(room.id, night.date)}
                              >
                                <span className="night-cell-date">
                                  <span>{dow?.short}</span>
                                  <span>{formatDayMonth(night.date)}</span>
                                </span>
                                <span className="night-cell-mark">{on ? "✓" : night.available ? "" : "–"}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              ))
            ) : (
              <tbody>
                <tr>
                  <td className="night-empty" colSpan={nights.length + 1}>
                    Không còn đêm trống trong khoảng này.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[#c23b3b]">Chọn ngày nhận và ngày trả hợp lệ.</p>
      )}
      {segments.length ? (
        <p className="mt-2 text-xs text-[#5c6665]">
          Chặng:{" "}
          {segments
            .map((segment) => `P.${numberOf.get(segment.roomId) || "?"} ${formatDayMonth(segment.checkIn)}→${formatDayMonth(segment.checkOut)}`)
            .join(" · ")}
        </p>
      ) : nights.length ? (
        <p className="mt-2 text-xs text-[#c23b3b]">Chọn ít nhất một đêm</p>
      ) : null}
      {saveHint ? <p className="mt-1 text-xs text-[#c23b3b]">{saveHint}</p> : null}
    </div>
  );
}
