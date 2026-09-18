import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createRoomAction,
  createRoomTypeAction,
  deleteRoomAction,
  deleteRoomTypeAction,
  setRoomTypeAction,
  updateRoomTypeAction,
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
        <p className="text-xs text-[#5c6665]">
          Cấu hình hạng: giá thường, giá lễ tết (T6–CN và ngày lễ), sức chứa tối đa. Giá bảng đổ vào form đặt phòng.
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3">
          <Link href="/sales" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
            Mở bán phòng
          </Link>
          <Link href="/sales/extras" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal">
            Dịch vụ kèm
          </Link>
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok ? <p className="text-sm text-[#1b7a4e]">Đã lưu.</p> : null}

      <div className="md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start md:gap-4">
        <div className="space-y-3">
          <Card>
            <h2 className="mb-2 font-bold">Thêm hạng phòng</h2>
            <form action={createRoomTypeAction} className="space-y-2">
              <Field label="Tên hạng">
                <input name="name" required placeholder="DELUXE VIEW" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Giá thường (₫)">
                  <input name="baseRate" inputMode="numeric" placeholder="800000" />
                </Field>
                <Field label="Giá lễ tết (₫)">
                  <input name="weekendRate" inputMode="numeric" placeholder="1000000" />
                </Field>
              </div>
              <Field label="Sức chứa tối đa">
                <input name="adults" type="number" min={1} placeholder="2" />
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
            <div className="mb-2 hidden gap-2 text-[11px] font-bold uppercase tracking-wide text-[#5c6665] md:grid md:grid-cols-[minmax(0,1.1fr)_1fr_1fr_5.5rem_auto]">
              <span>Hạng</span>
              <span>Giá thường</span>
              <span>Giá lễ tết</span>
              <span>Sức chứa</span>
              <span />
            </div>
            <div className="space-y-3">
              {types.map((type) => (
                <form
                  key={type.id}
                  action={updateRoomTypeAction}
                  className="space-y-2 rounded-xl bg-sand p-3 md:grid md:grid-cols-[minmax(0,1.1fr)_1fr_1fr_5.5rem_auto] md:items-end md:gap-2 md:space-y-0 md:bg-transparent md:p-0"
                >
                  <input type="hidden" name="id" value={type.id} />
                  <Field label="Hạng">
                    <input name="name" defaultValue={type.name} />
                  </Field>
                  <Field label="Giá thường (₫)">
                    <input name="baseRate" inputMode="numeric" defaultValue={type.baseRate || ""} placeholder="0" />
                  </Field>
                  <Field label="Giá lễ tết (₫)">
                    <input
                      name="weekendRate"
                      inputMode="numeric"
                      defaultValue={type.weekendRate || ""}
                      placeholder={type.baseRate ? String(type.baseRate) : "0"}
                    />
                  </Field>
                  <Field label="Sức chứa">
                    <input name="adults" type="number" min={1} defaultValue={type.adults || 2} />
                  </Field>
                  <div className="flex items-center justify-end gap-2 pb-0.5">
                    <span className="text-xs text-[#5c6665]">{counts[type.name] ?? 0} p</span>
                    <Btn type="submit" variant="ghost">
                      Lưu
                    </Btn>
                    {(counts[type.name] ?? 0) === 0 ? (
                      <button formAction={deleteRoomTypeAction} className="text-xs font-semibold text-[#c23b3b]">
                        Xóa
                      </button>
                    ) : null}
                  </div>
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
