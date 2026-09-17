import Link from "next/link";
import { redirect } from "next/navigation";
import { saveExtraRatesAction } from "@/actions/sales";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { extraUnitText } from "@/lib/extras";
import { formatVnd } from "@/lib/sales";
import { can } from "@/lib/permissions";
import { listSaleExtraTypes } from "@/lib/repos";

export default async function ExtraRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageRates")) redirect("/sales");
  const { error, ok } = await searchParams;
  const types = await listSaleExtraTypes();

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <Link href="/sales" className="text-sm font-semibold text-teal">
          ← Sơ đồ bán phòng
        </Link>
        <h1 className="mt-2 text-xl font-bold">Dịch vụ kèm</h1>
        <p className="text-xs text-[#5c6665]">
          Bảng giá phụ thu / dịch vụ thêm vào booking. Lễ tân chọn số lượng khi gắn vào đặt phòng. Chỉ quản lý sửa giá.
        </p>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok ? <p className="text-sm text-[#1b7a4e]">Đã lưu giá dịch vụ.</p> : null}

      <Card>
        <form action={saveExtraRatesAction} className="space-y-3">
          {types.map((type) => (
            <div key={type.id} className="space-y-2 rounded-xl bg-sand p-3">
              <input type="hidden" name="typeId" value={type.id} />
              <p className="font-semibold">{type.name}</p>
              <p className="text-xs text-[#5c6665]">{type.unitLabel || extraUnitText(type.unit)}</p>
              <Field label="Đơn giá (₫)">
                <input name={`price-${type.id}`} inputMode="numeric" defaultValue={type.unitPrice || ""} placeholder="0" />
              </Field>
            </div>
          ))}
          <Btn type="submit" className="w-full">
            Lưu giá dịch vụ
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
                {formatVnd(type.unitPrice)} / {type.unitLabel || extraUnitText(type.unit)}
              </span>
            </p>
          ))}
        </div>
      </Card>
    </main>
  );
}
