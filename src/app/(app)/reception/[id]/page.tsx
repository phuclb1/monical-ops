import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addRequestAction, addVehicleAction, completeRequestAction, inspectRoomAction, stayPatchAction, taskStatusAction } from "@/actions/ops";
import { ChecklistPanel } from "@/components/checklist-panel";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { RegistrationTimer } from "@/components/countdown";
import { getSession } from "@/lib/auth";
import { requestKindLabel, SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { maskName, maskPhone } from "@/lib/mask";
import { getStay } from "@/lib/repos";
import { STAY_TASK_KINDS, isChecklistTaskKind, taskTypeLabel } from "@/lib/task-types";
import type { SaleOrigin, SaleSource, TaskStatus } from "@/lib/types";

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
  const pii = can(user.role, "viewGuestPii");
  const roomTasks = stay.tasks.filter((task) => !isChecklistTaskKind(task.kind));

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">{pii ? stay.guestName : maskName(stay.guestName, user.role)}</h1>
      <p className="text-sm text-[#5c6665]">
        Mã {stay.pmsCode} · P.{stay.room?.number || "—"} · {stay.adults} NL / {stay.children} TE
      </p>
      <p className="text-xs text-[#5c6665]">
        {SALE_SOURCE_LABEL[stay.source as SaleSource] || stay.source || "—"} · {SALE_ORIGIN_LABEL[(stay.origin as SaleOrigin) || "ops"]}
      </p>
      {pii ? <p className="text-sm">SĐT {maskPhone(stay.guestPhone)}</p> : <p className="text-sm">SĐT đã che</p>}
      <RegistrationTimer dueAt={stay.registrationDueAt} doneAt={stay.registrationDoneAt} />

      {stay.checklists.map((list) => (
        <div key={list.id} className="space-y-1">
          {list.taskId ? (
            <Link href={`/tasks/${list.taskId}`} className="block text-sm font-semibold text-teal">
              Mở việc trên bảng
            </Link>
          ) : null}
          <ChecklistPanel list={list} hint="Cùng task trên bảng việc. Tick tay — không chặn nhận/trả phòng." />
        </div>
      ))}

      <Card className="space-y-2">
        <h2 className="font-bold">Đối chiếu ezCloudhotel PMS</h2>
        <p className="text-xs text-[#5c6665]">Booking có thể do agent đẩy từ ezCloud. Nút xác nhận vẫn dùng khi nhập tay trên PMS.</p>
        <Confirm id={stay.id} field="pmsBookingOk" label="Đã nhập booking" done={!!stay.pmsBookingOk} />
        <Confirm id={stay.id} field="pmsCheckinOk" label="Đã check-in PMS (bắt đầu 30 phút)" done={!!stay.pmsCheckinOk} />
        <Confirm id={stay.id} field="pmsCheckoutOk" label="Đã check-out PMS" done={!!stay.pmsCheckoutOk} />
        <Confirm id={stay.id} field="invoiceOk" label="Đã xuất hóa đơn" done={!!stay.invoiceOk} />
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Ghi chú bàn giao</h2>
        <p className="mb-2 text-xs text-[#5c6665]">Chỉ ghi lưu ý vận hành: VIP, dị ứng, ETA, giờ checkout… Không ghi lại nội dung booking.</p>
        <form action={stayPatchAction} className="space-y-2">
          <input type="hidden" name="id" value={stay.id} />
          <input type="hidden" name="field" value="notes" />
          <textarea name="notes" defaultValue={stay.notes || ""} rows={3} placeholder="Ví dụ: ăn chay, xe 51H-… chìa hộc 3, checkout 12:00" />
          <Btn type="submit" variant="ghost" className="w-full">
            Lưu ghi chú
          </Btn>
        </form>
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
        <h2 className="mb-2 font-bold">Việc theo phòng</h2>
        <p className="mb-2 text-xs text-[#5c6665]">Thành task trên bảng việc — khăn, dọn, báo thức, xe…</p>
        <ul className="space-y-2">
          {roomTasks.map((task) => (
            <li key={task.id} className="flex items-start justify-between gap-2 text-sm">
              <Link href={`/tasks/${task.id}`} className="font-medium text-teal">
                {taskTypeLabel(task.kind)}: {task.content}
              </Link>
              {["done", "checked", "archive"].includes(task.status) ? (
                <Chip tone="ok">{TASK_STATUS_LABEL[task.status as TaskStatus]}</Chip>
              ) : (
                <form action={taskStatusAction}>
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="status" value="done" />
                  <Btn type="submit" variant="ghost">
                    Xong
                  </Btn>
                </form>
              )}
            </li>
          ))}
          {stay.requests.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
              <span>
                {requestKindLabel(r.kind)}: {r.content} ×{r.quantity}
              </span>
              {r.status === "open" ? (
                <form action={completeRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="stayId" value={stay.id} />
                  <Btn type="submit" variant="ghost">
                    Xong
                  </Btn>
                </form>
              ) : (
                <Chip tone="ok">Đã xong</Chip>
              )}
            </li>
          ))}
        </ul>
        <form action={addRequestAction} className="mt-3 space-y-2">
          <input type="hidden" name="stayId" value={stay.id} />
          <input type="hidden" name="roomId" value={stay.roomId || ""} />
          <select name="kind" defaultValue="towels">
            {STAY_TASK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {taskTypeLabel(kind)}
              </option>
            ))}
          </select>
          <input name="content" required placeholder="Ví dụ: 2 khăn tắm / dọn đồ 14:00" />
          <Btn type="submit" variant="ghost" className="w-full">
            Thêm việc
          </Btn>
        </form>
      </Card>

      {stay.roomId && stay.status === "departing" ? (
        <form action={inspectRoomAction}>
          <input type="hidden" name="roomId" value={stay.roomId} />
          <input type="hidden" name="stayId" value={stay.id} />
          <Btn type="submit" className="w-full">
            Gửi HK dọn phòng trả
          </Btn>
        </form>
      ) : null}
    </main>
  );
}
