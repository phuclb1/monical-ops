import { redirect } from "next/navigation";
import { breakfastAction, confirmBreakfastAction } from "@/actions/ops";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { nextDate, todayVN } from "@/lib/datetime";
import { getBreakfast } from "@/lib/repos";

export default async function KitchenPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const date = nextDate(todayVN());
  const row = await getBreakfast(date);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Bếp · ăn sáng</h1>
      <p className="text-sm text-[#5c6665]">Dự báo ngày {date}</p>
      {row?.confirmedBy ? <Chip tone="ok">Bếp đã nhận số</Chip> : <Chip tone="warn">Chưa xác nhận</Chip>}

      <Card>
        <form action={breakfastAction} className="grid grid-cols-2 gap-2">
          <input type="hidden" name="date" value={date} />
          <Field label="Người lớn">
            <input name="adults" type="number" defaultValue={row?.adults ?? 0} />
          </Field>
          <Field label="Trẻ em">
            <input name="children" type="number" defaultValue={row?.children ?? 0} />
          </Field>
          <Field label="Ăn chay">
            <input name="vegetarian" type="number" defaultValue={row?.vegetarian ?? 0} />
          </Field>
          <Field label="Dị ứng">
            <input name="allergy" type="number" defaultValue={row?.allergy ?? 0} />
          </Field>
          <Field label="Ăn sớm">
            <input name="early" type="number" defaultValue={row?.early ?? 0} />
          </Field>
          <Field label="Mang đi">
            <input name="takeaway" type="number" defaultValue={row?.takeaway ?? 0} />
          </Field>
          <div className="col-span-2">
            <Field label="Ghi chú (dị ứng, suất sớm)">
              <textarea name="notes" defaultValue={row?.notes || ""} />
            </Field>
          </div>
          {can(user.role, "editBreakfast") ? (
            <div className="col-span-2">
              <Btn type="submit" className="w-full">
                Gửi / cập nhật số
              </Btn>
            </div>
          ) : null}
        </form>
      </Card>

      {can(user.role, "confirmBreakfast") && row ? (
        <form action={confirmBreakfastAction}>
          <input type="hidden" name="date" value={date} />
          <Btn type="submit" variant="gold" className="w-full">
            Bếp đã nhận số
          </Btn>
        </form>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">Thực tế khách ăn</h2>
        <form action={breakfastAction} className="grid grid-cols-2 gap-2">
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="adults" value={row?.adults ?? 0} />
          <input type="hidden" name="children" value={row?.children ?? 0} />
          <input type="hidden" name="vegetarian" value={row?.vegetarian ?? 0} />
          <input type="hidden" name="allergy" value={row?.allergy ?? 0} />
          <input type="hidden" name="early" value={row?.early ?? 0} />
          <input type="hidden" name="takeaway" value={row?.takeaway ?? 0} />
          <Field label="Thực tế NL">
            <input name="actualAdults" type="number" defaultValue={row?.actualAdults ?? ""} />
          </Field>
          <Field label="Thực tế TE">
            <input name="actualChildren" type="number" defaultValue={row?.actualChildren ?? ""} />
          </Field>
          <div className="col-span-2">
            <Btn type="submit" variant="ghost" className="w-full">
              Lưu thực tế
            </Btn>
          </div>
        </form>
      </Card>
    </main>
  );
}
