import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HK_LABEL } from "@/lib/constants";
import { listRooms, listUsers } from "@/lib/repos";
import { Card, Chip } from "@/components/ui";
import type { HkStatus } from "@/lib/types";

const TONE: Record<string, "ok" | "warn" | "danger" | "teal" | "neutral"> = {
  waiting: "warn",
  accepted: "neutral",
  cleaning: "teal",
  waiting_inspect: "warn",
  ins: "ok",
  ooo: "danger",
};

export default async function RoomsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [rooms, users] = await Promise.all([listRooms(), listUsers()]);
  const sorted = [...rooms].sort((a, b) => {
    const pri = (r: typeof a) => (r.opsStatus === "ooo" ? 0 : r.hkStatus === "waiting" ? 1 : r.hkStatus === "cleaning" ? 2 : 3);
    return pri(a) - pri(b) || a.number.localeCompare(b.number);
  });
  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Phòng vận hành</h1>
      <p className="text-xs text-[#5c6665]">Trạng thái dọn / INS / OOO trên web này. Tình trạng bán phòng vẫn do PMS.</p>
      <div className="list-cards">
      {sorted.map((room) => {
        const who = users.find((u) => u.id === room.assignedTo);
        return (
          <Link key={room.id} href={`/rooms/${room.id}`}>
            <Card className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">P.{room.number}</p>
                <p className="text-xs text-[#5c6665]">
                  Tầng {room.floor} · {room.type}
                  {who ? ` · ${who.fullName}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Chip tone={room.opsStatus === "ooo" ? "danger" : TONE[room.hkStatus] || "neutral"}>
                  {room.opsStatus === "ooo" ? "OOO" : HK_LABEL[room.hkStatus as HkStatus]}
                </Chip>
                {room.oooReason ? <span className="text-[11px] text-[#c23b3b]">{room.oooApproved ? "Đã duyệt" : "Chờ duyệt"}</span> : null}
              </div>
            </Card>
          </Link>
        );
      })}
      </div>
    </main>
  );
}
