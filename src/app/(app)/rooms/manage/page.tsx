import { redirect } from "next/navigation";
import {
  createRoomAction,
  createRoomTypeAction,
  deleteRoomAction,
  deleteRoomTypeAction,
  renameRoomTypeAction,
  setRoomTypeAction,
} from "@/actions/rooms";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listRooms, listRoomTypes } from "@/lib/repos";

export default async function ManageRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageRooms")) redirect("/rooms");
  const { error, ok } = await searchParams;
  const [types, rooms] = await Promise.all([listRoomTypes(), listRooms()]);
  const sorted = [...rooms].sort((a, b) => a.number.localeCompare(b.number));
  const counts = Object.fromEntries(types.map((type) => [type.name, rooms.filter((r) => r.type === type.name).length]));

  return (
    <main className="space-y-4 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Phòng & hạng phòng</h1>
        <p className="text-xs text-[#5c6665]">Quản lý danh mục phòng vận hành. Bán phòng vẫn do PMS.</p>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok ? <p className="text-sm text-[#1b7a4e]">Đã lưu.</p> : null}

      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-4">
        <div className="space-y-3">
          <Card>
            <h2 className="mb-2 font-bold">Thêm hạng phòng</h2>
            <form action={createRoomTypeAction} className="space-y-2">
              <Field label="Tên hạng">
                <input name="name" required placeholder="DELUXE VIEW" />
              </Field>
              <Btn type="submit" className="w-full">
                Thêm hạng
              </Btn>
            </form>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Thêm phòng</h2>
            <form action={createRoomAction} className="space-y-2">
              <Field label="Số phòng">
                <input name="number" required inputMode="numeric" placeholder="506" />
              </Field>
              <Field label="Hạng phòng">
                <select name="type" required defaultValue={types[0]?.name || ""}>
                  {types.map((type) => (
                    <option key={type.id} value={type.name}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Btn type="submit" className="w-full">
                Thêm phòng
              </Btn>
            </form>
          </Card>
        </div>

        <div className="mt-3 space-y-3 md:mt-0">
          <Card>
            <h2 className="mb-3 font-bold">Hạng phòng ({types.length})</h2>
            <div className="space-y-2">
              {types.map((type) => (
                <form key={type.id} action={renameRoomTypeAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={type.id} />
                  <input name="name" defaultValue={type.name} className="min-w-0 flex-1" />
                  <span className="w-8 text-right text-xs text-[#5c6665]">{counts[type.name] ?? 0}</span>
                  <Btn type="submit" variant="ghost">
                    Lưu
                  </Btn>
                  {(counts[type.name] ?? 0) === 0 ? (
                    <button formAction={deleteRoomTypeAction} className="text-xs font-semibold text-[#c23b3b]">
                      Xóa
                    </button>
                  ) : null}
                </form>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-bold">Phòng ({sorted.length})</h2>
            <div className="space-y-2">
              {sorted.map((room) => (
                <form key={room.id} action={setRoomTypeAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={room.id} />
                  <p className="w-14 font-bold">P.{room.number}</p>
                  <select name="type" defaultValue={room.type} className="min-w-0 flex-1">
                    {types.map((type) => (
                      <option key={type.id} value={type.name}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  <Btn type="submit" variant="ghost">
                    Lưu
                  </Btn>
                  <button formAction={deleteRoomAction} className="text-xs font-semibold text-[#c23b3b]">
                    Xóa
                  </button>
                </form>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
