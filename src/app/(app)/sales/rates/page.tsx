import Link from "next/link";
import { redirect } from "next/navigation";
import { saveRoomRatesAction } from "@/actions/sales";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatVnd } from "@/lib/sales";
import { can } from "@/lib/permissions";
import { listRoomTypes } from "@/lib/repos";

export default async function RoomRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageRates")) redirect("/sales");
  const { error, ok } = await searchParams;
  const types = await listRoomTypes();

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <Link href="/sales" className="text-sm font-semibold text-teal">
          ← Sơ đồ bán phòng
        </Link>
        <h1 className="mt-2 text-xl font-bold">Giá phòng</h1>
        <p className="text-xs text-[#5c6665]">
          Giá bảng theo hạng. Ngày thường T2–T5, cuối tuần T6–CN. Chỉ quản lý sửa. Khi bán lễ tân vẫn chọn giá / chiết khấu từng chỗ.
        </p>
        <Link href="/sales/extras" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-teal">
          Dịch vụ kèm
        </Link>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok ? <p className="text-sm text-[#1b7a4e]">Đã lưu giá hạng.</p> : null}

      <Card>
        <form action={saveRoomRatesAction} className="space-y-3">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_1fr_1fr] gap-2 text-[11px] font-bold uppercase tracking-wide text-[#5c6665] md:grid">
            <span>Hạng</span>
            <span>Ngày thường</span>
            <span>Cuối tuần</span>
          </div>
          {types.map((type) => (
            <div key={type.id} className="space-y-2 rounded-xl bg-sand p-3 md:grid md:grid-cols-[minmax(0,1.2fr)_1fr_1fr] md:items-end md:gap-2 md:space-y-0 md:bg-transparent md:p-0">
              <input type="hidden" name="typeId" value={type.id} />
              <p className="font-semibold">{type.name}</p>
              <Field label="Ngày thường (₫)">
                <input name={`rate-${type.id}`} inputMode="numeric" defaultValue={type.baseRate || ""} placeholder="0" />
              </Field>
              <Field label="Cuối tuần T6–CN (₫)">
                <input name={`weekend-${type.id}`} inputMode="numeric" defaultValue={type.weekendRate || ""} placeholder={type.baseRate ? String(type.baseRate) : "0"} />
              </Field>
            </div>
          ))}
          <p className="text-xs text-[#5c6665]">Để trống cuối tuần thì dùng giá ngày thường. Hiện {types.filter((type) => type.baseRate).length} hạng đã có giá.</p>
          <Btn type="submit" className="w-full">
            Lưu giá
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Bảng đang áp dụng</h2>
        <div className="space-y-1 text-sm">
          {types.map((type) => (
            <p key={type.id} className="flex justify-between gap-2">
              <span>{type.name}</span>
              <span className="text-[#5c6665]">
                {type.baseRate ? formatVnd(type.baseRate) : "—"}
                {type.weekendRate ? ` · T6–CN ${formatVnd(type.weekendRate)}` : ""}
              </span>
            </p>
          ))}
        </div>
      </Card>
    </main>
  );
}
