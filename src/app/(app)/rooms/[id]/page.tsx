import { notFound, redirect } from "next/navigation";
import { approveOooAction, reportOooAction, roomStatusAction, saveRoomChecklistAction } from "@/actions/ops";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { HK_LABEL, ROOM_CHECKLIST } from "@/lib/constants";
import { getRoom, listUsers } from "@/lib/repos";
import type { HkStatus } from "@/lib/types";

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;
  const data = await getRoom(id);
  if (!data) notFound();
  const users = await listUsers();
  const { room, stay } = data;
  const next: Record<string, string> = {
    waiting: "accepted",
    accepted: "cleaning",
    cleaning: "waiting_inspect",
    waiting_inspect: "ins",
  };

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">P.{room.number}</h1>
          <p className="text-sm text-[#5c6665]">{room.type}</p>
        </div>
        <Chip tone={room.opsStatus === "ooo" ? "danger" : room.hkStatus === "ins" ? "ok" : "warn"}>
          {room.opsStatus === "ooo" ? "OOO" : HK_LABEL[room.hkStatus as HkStatus]}
        </Chip>
      </div>
      {stay ? <p className="text-sm">Khách tham chiếu: {stay.guestName} · {stay.pmsCode}</p> : <p className="text-sm">Phòng trống trên web vận hành</p>}

      {can(user.role, "updateHk") && next[room.hkStatus] ? (
        <form action={roomStatusAction}>
          <input type="hidden" name="id" value={room.id} />
          <input type="hidden" name="hkStatus" value={next[room.hkStatus]} />
          <Btn type="submit" className="w-full">
            Chuyển → {HK_LABEL[next[room.hkStatus] as HkStatus]}
          </Btn>
        </form>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">BM-06 Checklist phòng sạch</h2>
        <form action={saveRoomChecklistAction} className="space-y-2">
          <input type="hidden" name="roomId" value={room.id} />
          {ROOM_CHECKLIST.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm font-normal">
              <input type="checkbox" name={item.key} className="h-5 w-5" />
              <span>
                {item.label} {item.required ? <em className="text-[#c47b12]">*</em> : null}
              </span>
            </label>
          ))}
          <Field label="Xác nhận / chữ ký tên">
            <input name="signature" placeholder="Gõ tên để xác nhận" />
          </Field>
          <Btn type="submit" className="w-full">
            Lưu checklist
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Báo hỏng / OOO</h2>
        <form action={reportOooAction} className="space-y-2">
          <input type="hidden" name="id" value={room.id} />
          <textarea name="oooReason" required placeholder="Rò nước, hỏng điều hòa... Có thể chụp ảnh ở sự cố." />
          <Btn type="submit" variant="danger" className="w-full">
            Báo OOO — chờ quản lý duyệt
          </Btn>
        </form>
        {room.opsStatus === "ooo" && can(user.role, "approveOoo") ? (
          <form action={approveOooAction} className="mt-2">
            <input type="hidden" name="id" value={room.id} />
            <Btn type="submit" className="w-full">
              Duyệt OOO
            </Btn>
          </form>
        ) : null}
      </Card>

      <form action={roomStatusAction} className="card space-y-2 p-3">
        <input type="hidden" name="id" value={room.id} />
        <Field label="Giao cho HK">
          <select name="assignedTo" defaultValue={room.assignedTo || ""}>
            <option value="">Chưa giao</option>
            {users
              .filter((u) => u.role === "hk" || u.role === "manager")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
          </select>
        </Field>
        <Btn type="submit" variant="ghost" className="w-full">
          Lưu phân công
        </Btn>
      </form>
    </main>
  );
}
