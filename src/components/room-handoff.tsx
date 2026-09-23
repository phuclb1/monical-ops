import Link from "next/link";
import { checkinSaleAction, checkoutSaleAction } from "@/actions/sales";
import { requestHandoffAction } from "@/actions/ops";
import { Btn, Card, Chip } from "@/components/ui";
import { TASK_STATUS_LABEL } from "@/lib/constants";
import { canCheckinAfterStandby, canCheckoutAfterInspect, doneHandoff, openHandoff, type HandoffTask } from "@/lib/room-handoff";
import { taskTypeLabel } from "@/lib/task-types";
import type { TaskStatus } from "@/lib/types";

type Task = {
  id: string;
  kind: string;
  formCode: string | null;
  status: string;
  content: string;
};

export function RoomHandoffPanel({
  roomId,
  stayId,
  saleId,
  saleStatus,
  checkIn,
  today,
  tasks,
  error,
  showSaleActions = true,
}: {
  roomId: string;
  stayId?: string;
  saleId?: string;
  saleStatus: string;
  checkIn?: string;
  today?: string;
  tasks: Task[];
  error?: string;
  showSaleActions?: boolean;
}) {
  const state = {
    standbyOpen: openHandoff(tasks, "standby"),
    standbyDone: doneHandoff(tasks, "standby"),
    stayoverOpen: openHandoff(tasks, "stayover"),
    inspectOpen: openHandoff(tasks, "checkout_inspect"),
    inspectDone: doneHandoff(tasks, "checkout_inspect"),
    canCheckin: canCheckinAfterStandby(tasks),
    canCheckout: canCheckoutAfterInspect(tasks),
  };
  const arriving = saleStatus === "reserved";
  const staying = saleStatus === "inhouse";
  const tooEarly = Boolean(arriving && today && checkIn && today < checkIn);

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">Giao việc HK</h2>
        <p className="mt-1 text-xs text-[#5c6665]">
          Lễ tân bấm gửi HK. HK hoàn thành kiểm phòng thì mới nhận / trả.
        </p>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      {arriving ? (
        <HandoffRow
          label="Standby trước nhận"
          open={state.standbyOpen}
          done={state.standbyDone}
          actionLabel="Yêu cầu HK kiểm phòng standby"
          purpose="standby"
          roomId={roomId}
          stayId={stayId}
          saleId={saleId}
        />
      ) : null}

      {staying ? (
        <>
          <HandoffRow
            label="Dọn khi khách đang ở"
            open={state.stayoverOpen}
            actionLabel="Yêu cầu HK dọn phòng khách ở"
            purpose="stayover"
            roomId={roomId}
            stayId={stayId}
            saleId={saleId}
            allowRepeat
          />
          <HandoffRow
            label="Kiểm phòng trước trả"
            open={state.inspectOpen}
            done={state.inspectDone}
            actionLabel="Yêu cầu HK kiểm phòng trả"
            purpose="checkout_inspect"
            roomId={roomId}
            stayId={stayId}
            saleId={saleId}
          />
        </>
      ) : null}

      {showSaleActions && saleId && arriving ? (
        state.canCheckin && !tooEarly ? (
          <form action={checkinSaleAction}>
            <input type="hidden" name="id" value={saleId} />
            <Btn type="submit" className="w-full">
              Nhận phòng
            </Btn>
          </form>
        ) : (
          <p className="text-sm text-[#9a5b00]">
            {tooEarly ? "Chưa đến ngày nhận." : "Chờ HK hoàn thành kiểm standby rồi mới nhận phòng."}
          </p>
        )
      ) : null}

      {showSaleActions && saleId && staying ? (
        state.canCheckout ? (
          <form action={checkoutSaleAction}>
            <input type="hidden" name="id" value={saleId} />
            <Btn type="submit" className="w-full">
              Hoàn tất trả phòng
            </Btn>
          </form>
        ) : (
          <p className="text-sm text-[#9a5b00]">Chờ HK kiểm phòng xong rồi mới hoàn tất trả phòng. Sau đó hệ thống tự tạo việc dọn trả.</p>
        )
      ) : null}
    </Card>
  );
}

function HandoffRow({
  label,
  open,
  done,
  actionLabel,
  purpose,
  roomId,
  stayId,
  saleId,
  allowRepeat,
}: {
  label: string;
  open?: HandoffTask;
  done?: HandoffTask;
  actionLabel: string;
  purpose: string;
  roomId: string;
  stayId?: string;
  saleId?: string;
  allowRepeat?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-sand p-3">
      <p className="text-sm font-semibold">{label}</p>
      {open?.id ? (
        <Link href={`/tasks/${open.id}`} className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-teal">
          <span>{open.content}</span>
          <Chip tone="warn">{TASK_STATUS_LABEL[open.status as TaskStatus] || "Đang làm"}</Chip>
        </Link>
      ) : done?.id && !allowRepeat ? (
        <Link href={`/tasks/${done.id}`} className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-teal">
          <span>{taskTypeLabel(done.kind)} — HK đã xong</span>
          <Chip tone="ok">Xong</Chip>
        </Link>
      ) : (
        <form action={requestHandoffAction}>
          <input type="hidden" name="purpose" value={purpose} />
          <input type="hidden" name="roomId" value={roomId} />
          {stayId ? <input type="hidden" name="stayId" value={stayId} /> : null}
          {saleId ? <input type="hidden" name="saleId" value={saleId} /> : null}
          <Btn type="submit" variant="ghost" className="w-full">
            {actionLabel}
          </Btn>
        </form>
      )}
    </div>
  );
}
