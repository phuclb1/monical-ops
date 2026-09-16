import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HK_LABEL } from "@/lib/constants";
import { todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listRooms, listRoomTypes, listUsers, roomFocusBoard } from "@/lib/repos";
import { isRoomFocus } from "@/lib/room-focus";
import { RoomFocusChips } from "@/components/room-focus-chips";
import { Card, Chip, Empty, TabChip } from "@/components/ui";
import type { HkStatus } from "@/lib/types";

const TONE: Record<string, "ok" | "warn" | "danger" | "teal" | "neutral"> = {
  waiting: "warn",
  accepted: "neutral",
  cleaning: "teal",
  waiting_inspect: "warn",
  ins: "ok",
  ooo: "danger",
};

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; focus?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { type, focus: rawFocus } = await searchParams;
  const raw = rawFocus || "";
  const focus = isRoomFocus(raw) ? raw : "";
  const date = todayVN();
  const [rooms, users, types, focusBoard] = await Promise.all([
    listRooms(),
    listUsers(),
    listRoomTypes(),
    roomFocusBoard(date),
  ]);
  const hits = focus ? focusBoard[focus] : [];
  const hitByRoom = new Map(hits.map((hit) => [hit.roomId, hit]));
  const filtered = rooms.filter((room) => {
    if (type && room.type !== type) return false;
    if (focus && !hitByRoom.has(room.id)) return false;
    return true;
  });
  const floors = [...new Set(filtered.map((room) => room.floor))].sort((a, b) => a - b);
  const roomsHref = (extra: { type?: string; focus?: string }) => {
    const next = new URLSearchParams();
    const nextType = extra.type === "" ? "" : extra.type ?? type;
    const nextFocus = extra.focus === "" ? "" : extra.focus ?? focus;
    if (nextType) next.set("type", nextType);
    if (nextFocus) next.set("focus", nextFocus);
    const text = next.toString();
    return text ? `/rooms?${text}` : "/rooms";
  };

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Phòng vận hành</h1>
          <p className="text-xs text-[#5c6665]">
            {filtered.length} phòng · trạng thái dọn / INS / OOO. Bán phòng nằm ở mục Bán phòng.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {can(user.role, "manageSales") ? (
            <Link href="/sales" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Bán phòng
            </Link>
          ) : null}
          {can(user.role, "manageRooms") ? (
            <Link href="/rooms/manage" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Hạng phòng
            </Link>
          ) : null}
        </div>
      </div>

      <RoomFocusChips path="/rooms" query={{ type }} date={date} focus={focus} counts={focusBoard.counts} />

      <div className="tab-scroller -mx-3 px-3 pb-1">
        <TabChip href={roomsHref({ type: "" })} active={!type}>
          Tất cả hạng
        </TabChip>
        {types.map((item) => (
          <TabChip key={item.id} href={roomsHref({ type: item.name })} active={type === item.name}>
            {item.name}
          </TabChip>
        ))}
      </div>

      {focus && !filtered.length ? <Empty title="Không có phòng khớp bộ lọc" text="Bỏ quick filter hoặc đổi hạng phòng." /> : null}

      {floors.map((floor) => {
        const onFloor = filtered
          .filter((room) => room.floor === floor)
          .sort((a, b) => a.number.localeCompare(b.number) || a.type.localeCompare(b.type));
        return (
          <section key={floor} className="space-y-2">
            <h2 className="text-sm font-bold text-[#5c6665]">Tầng {floor}</h2>
            <div className="list-cards">
              {onFloor.map((room) => {
                const who = users.find((u) => u.id === room.assignedTo && u.active);
                const hit = hitByRoom.get(room.id);
                return (
                  <Link key={room.id} href={hit?.href || `/rooms/${room.id}`}>
                    <Card className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold">P.{room.number}</p>
                        <p className="text-xs text-[#5c6665]">
                          {room.type}
                          {who ? ` · ${who.fullName}` : ""}
                        </p>
                        {hit?.guestName || hit?.hint ? (
                          <p className="mt-1 text-xs font-semibold">
                            {hit.guestName || hit.hint}
                            {hit.guestName && hit.hint ? ` · ${hit.hint}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Chip tone={room.opsStatus === "ooo" ? "danger" : TONE[room.hkStatus] || "neutral"}>
                          {room.opsStatus === "ooo" ? "OOO" : HK_LABEL[room.hkStatus as HkStatus]}
                        </Chip>
                        {room.oooReason ? (
                          <span className="text-[11px] text-[#c23b3b]">{room.oooApproved ? "Đã duyệt" : "Chờ duyệt"}</span>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
