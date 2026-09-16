import { TabChip } from "@/components/ui";
import { todayVN } from "@/lib/datetime";
import { ROOM_FOCUS_IDS, isRoomFocus, roomFocusLabel, type RoomFocus } from "@/lib/room-focus";

export function RoomFocusChips({
  path,
  query,
  date,
  focus,
  counts,
}: {
  path: string;
  query: Record<string, string | undefined>;
  date: string;
  focus?: string;
  counts: Record<RoomFocus, number>;
}) {
  const active = isRoomFocus(focus || "") ? focus : "";
  const today = todayVN();
  const hrefFor = (id?: RoomFocus) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value && key !== "focus") next.set(key, value);
    }
    if (id) next.set("focus", id);
    const text = next.toString();
    return text ? `${path}?${text}` : path;
  };
  return (
    <div className="tab-scroller -mx-3 px-3 pb-1">
      <TabChip href={hrefFor()} active={!active}>
        Mọi phòng
      </TabChip>
      {ROOM_FOCUS_IDS.map((id) => (
        <TabChip key={id} href={hrefFor(id)} active={active === id}>
          {roomFocusLabel(id, date, today)} · {counts[id]}
        </TabChip>
      ))}
    </div>
  );
}
