import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HK_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { listRooms, listRoomTypes, listUsers } from "@/lib/repos";
import { Card, Chip, TabChip } from "@/components/ui";
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
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { type } = await searchParams;
  const [rooms, users, types] = await Promise.all([listRooms(), listUsers(), listRoomTypes()]);
  const filtered = rooms.filter((room) => !type || room.type === type);
  const floors = [...new Set(filtered.map((room) => room.floor))].sort((a, b) => a - b);

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

      <div className="tab-scroller -mx-3 px-3 pb-1">
        <TabChip href="/rooms" active={!type}>
          Tất cả
        </TabChip>
        {types.map((item) => (
          <TabChip key={item.id} href={`/rooms?type=${encodeURIComponent(item.name)}`} active={type === item.name}>
            {item.name}
          </TabChip>
        ))}
      </div>

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
                return (
                  <Link key={room.id} href={`/rooms/${room.id}`}>
                    <Card className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-bold">P.{room.number}</p>
                        <p className="text-xs text-[#5c6665]">
                          {room.type}
                          {who ? ` · ${who.fullName}` : ""}
                        </p>
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
