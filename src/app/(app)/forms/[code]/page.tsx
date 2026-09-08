import { redirect } from "next/navigation";
import { saveFormAction } from "@/actions/ops";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { FORM_CATALOG } from "@/lib/constants";
import { currentOpenShift, listRooms, listStays } from "@/lib/repos";

export default async function FormFillPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { code } = await params;
  const meta = FORM_CATALOG.find((f) => f.code === code);
  const [rooms, stays, shift] = await Promise.all([listRooms(), listStays(), currentOpenShift()]);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">
        {code} {meta?.name}
      </h1>
      {!meta?.p0 ? <p className="text-sm text-[#c47b12]">Mẫu P1 — bản rút gọn để ghi nhận.</p> : null}
      <Card>
        <form action={saveFormAction} className="space-y-3">
          <input type="hidden" name="formCode" value={code} />
          <input type="hidden" name="shiftId" value={shift?.id || ""} />
          <Field label="Phòng">
            <select name="roomId" defaultValue="">
              <option value="">Không gắn</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  P.{r.number}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Booking PMS">
            <select name="stayId" defaultValue="">
              <option value="">Không gắn</option>
              {stays.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.pmsCode} {s.guestName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nội dung / diễn giải">
            <textarea name="summary" required placeholder="Ghi nhận theo mẫu" />
          </Field>
          {code === "BM-15" ? (
            <>
              <Field label="Việc quá hạn">
                <input name="overdue" placeholder="Số việc / ghi chú" />
              </Field>
              <Field label="Sự cố trong ngày">
                <input name="incidents" />
              </Field>
              <Field label="Ghi chú quản lý">
                <textarea name="managerNote" />
              </Field>
            </>
          ) : null}
          {code === "BM-02" ? (
            <>
              <Field label="Quỹ đầu ca">
                <input name="openCash" />
              </Field>
              <Field label="Quỹ cuối ca">
                <input name="closeCash" />
              </Field>
            </>
          ) : null}
          <Field label="Chữ ký / xác nhận tên">
            <input name="signature" required placeholder={user.fullName} />
          </Field>
          <Btn type="submit" className="w-full">
            Nộp biểu mẫu
          </Btn>
        </form>
      </Card>
    </main>
  );
}
