import { notFound, redirect } from "next/navigation";
import { addRequestAction, addVehicleAction, inspectRoomAction, stayPatchAction } from "@/actions/ops";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { RegistrationTimer } from "@/components/countdown";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { maskName, maskPhone } from "@/lib/mask";
import { getStay, listUsers } from "@/lib/repos";

function Confirm({ id, field, label, done }: { id: string; field: string; label: string; done: boolean }) {
  if (done) return <Chip tone="ok">{label} — đã xác nhận</Chip>;
  return (
    <form action={stayPatchAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <Btn type="submit" variant="ghost" className="w-full">
        Xác nhận {label}
      </Btn>
    </form>
  );
}

export default async function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;
  const stay = await getStay(id);
  if (!stay) notFound();
  const users = await listUsers();
  const pii = can(user.role, "viewGuestPii");

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">{pii ? stay.guestName : maskName(stay.guestName, user.role)}</h1>
      <p className="text-sm text-[#5c6665]">
        Mã PMS {stay.pmsCode} · P.{stay.room?.number || "—"} · {stay.adults} NL / {stay.children} TE
      </p>
      {pii ? <p className="text-sm">SĐT {maskPhone(stay.guestPhone)}</p> : <p className="text-sm">SĐT đã che</p>}
      <RegistrationTimer dueAt={stay.registrationDueAt} doneAt={stay.registrationDoneAt} />

      <Card className="space-y-2">
        <h2 className="font-bold">Đối chiếu ezCloudhotel PMS</h2>
        <Confirm id={stay.id} field="pmsBookingOk" label="Đã nhập booking" done={!!stay.pmsBookingOk} />
        <Confirm id={stay.id} field="pmsCheckinOk" label="Đã check-in PMS (bắt đầu 30 phút)" done={!!stay.pmsCheckinOk} />
        <Confirm id={stay.id} field="pmsCheckoutOk" label="Đã check-out PMS" done={!!stay.pmsCheckoutOk} />
        <Confirm id={stay.id} field="invoiceOk" label="Đã xuất hóa đơn" done={!!stay.invoiceOk} />
      </Card>

      {!stay.registrationDoneAt && stay.pmsCheckinOk ? (
        <Card>
          <form action={stayPatchAction} className="space-y-2">
            <input type="hidden" name="id" value={stay.id} />
            <input type="hidden" name="field" value="registrationDone" />
            <Field label="Lý do nếu quá 30 phút">
              <input name="reason" placeholder="Khách đi vệ sinh / chờ CCCD..." />
            </Field>
            <Btn type="submit" className="w-full">
              Hoàn tất đăng ký lưu trú
            </Btn>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">Gửi xe</h2>
        {stay.vehicles.map((v) => (
          <p key={v.id} className="text-sm">
            {v.vehicleType} {v.plate} · {v.location} · chìa: {v.keyLocation}
          </p>
        ))}
        <form action={addVehicleAction} className="mt-2 space-y-2">
          <input type="hidden" name="stayId" value={stay.id} />
          <input name="vehicleType" placeholder="Ô tô / xe máy" required />
          <input name="plate" placeholder="Biển số" required />
          <input name="location" placeholder="Vị trí gửi" />
          <input name="keyLocation" placeholder="Nơi giữ chìa" />
          <Btn type="submit" variant="ghost" className="w-full">
            Ghi gửi xe
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Yêu cầu thêm</h2>
        {stay.requests.map((r) => (
          <p key={r.id} className="text-sm">
            {r.kind}: {r.content} ×{r.quantity} · {r.status}
          </p>
        ))}
        <form action={addRequestAction} className="mt-2 space-y-2">
          <input type="hidden" name="stayId" value={stay.id} />
          <input type="hidden" name="roomId" value={stay.roomId || ""} />
          <select name="kind" defaultValue="extra">
            <option value="extra">Yêu cầu thêm</option>
            <option value="complaint">Phàn nàn</option>
            <option value="wake">Báo thức</option>
            <option value="pickup">Xe đón</option>
            <option value="early_breakfast">Ăn sáng sớm</option>
          </select>
          <input name="content" required placeholder="Nội dung" />
          <input name="quantity" type="number" defaultValue={1} />
          <select name="assigneeId" defaultValue="">
            <option value="">Người xử lý</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
          <Btn type="submit" variant="ghost" className="w-full">
            Thêm yêu cầu
          </Btn>
        </form>
      </Card>

      {stay.roomId ? (
        <form action={inspectRoomAction}>
          <input type="hidden" name="roomId" value={stay.roomId} />
          <Btn type="submit" className="w-full">
            Gửi HK kiểm / dọn phòng
          </Btn>
        </form>
      ) : null}
    </main>
  );
}
