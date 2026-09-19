"use client";

import { useMemo, useState } from "react";
import { Btn } from "@/components/ui";
import { groupRoomsByType, type Room } from "./shared";

export function AddBookingRoomsForm({
  action,
  rooms,
  saleId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  rooms: Room[];
  saleId: string;
}) {
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => `p.${room.number} ${room.number} ${room.type}`.toLowerCase().includes(q));
  }, [rooms, query]);
  const groups = groupRoomsByType(filtered, []);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={saleId} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm hạng / số phòng" />
      <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-line p-2">
        {groups.map((group) => (
          <div key={group.type}>
            <p className="px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7a72]">{group.type}</p>
            {group.rooms.map((room) => (
              <label key={room.id} className="min-h-11 gap-2 rounded-lg px-2 py-1">
                <input
                  type="checkbox"
                  name="roomId"
                  value={room.id}
                  checked={roomIds.includes(room.id)}
                  onChange={() => setRoomIds((prev) => (prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id]))}
                />
                <span className="text-sm font-semibold">P.{room.number}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <Btn type="submit" className="w-full" disabled={!roomIds.length}>
        {roomIds.length > 1 ? `Thêm ${roomIds.length} phòng` : "Thêm phòng vào booking"}
      </Btn>
    </form>
  );
}
