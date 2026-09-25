"use client";

import { useState } from "react";
import { approveBookingChangeAction, rejectBookingChangeAction } from "@/actions/sales";
import { formatAuditWhen } from "@/lib/audit-view";
import type { Role } from "@/lib/types";
import { Btn, Card, Chip, Field } from "@/components/ui";

type ApprovalRow = {
  id: string;
  bookingId: string;
  status: string;
  summary: string;
  requestedAt: string;
  requestedByName: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
};

const STATUS = {
  pending: { label: "Chờ quản lý duyệt", tone: "warn" },
  approved: { label: "Đã duyệt", tone: "ok" },
  rejected: { label: "Đã từ chối", tone: "danger" },
  conflicted: { label: "Không thể áp dụng", tone: "danger" },
} as const;

export function BookingApprovals({
  rows,
  role,
}: {
  rows: ApprovalRow[];
  role: Role;
}) {
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  if (!rows.length) return null;
  return (
    <>
      <Card className="border border-[#d9b75b] bg-[#fffaf0]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Phê duyệt thay đổi</h2>
          <Chip tone={rows.some((row) => row.status === "pending") ? "warn" : "neutral"}>
            {rows.filter((row) => row.status === "pending").length || "Lịch sử"}
          </Chip>
        </div>
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const status = STATUS[row.status as keyof typeof STATUS] || {
              label: row.status,
              tone: "neutral" as const,
            };
            return (
              <article key={row.id} className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{row.summary}</p>
                    <p className="mt-1 text-xs text-[#5c6665]">
                      {row.requestedByName} · {formatAuditWhen(row.requestedAt)}
                    </p>
                  </div>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </div>
                {row.reviewedAt ? (
                  <p className="mt-2 text-xs text-[#5c6665]">
                    {row.reviewedByName} · {formatAuditWhen(row.reviewedAt)}
                    {row.reviewNote ? ` · ${row.reviewNote}` : ""}
                  </p>
                ) : null}
                {row.status === "pending" && role === "manager" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                    <form action={approveBookingChangeAction}>
                      <input type="hidden" name="requestId" value={row.id} />
                      <input type="hidden" name="bookingId" value={row.bookingId} />
                      <Btn type="submit" className="w-full">
                        Chấp nhận
                      </Btn>
                    </form>
                    <Btn type="button" variant="danger" className="w-full" onClick={() => setRejecting(row)}>
                      Từ chối
                    </Btn>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </Card>

      {rejecting ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-booking-change-title"
          onClick={() => setRejecting(null)}
        >
          <form
            action={rejectBookingChangeAction}
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <input type="hidden" name="requestId" value={rejecting.id} />
            <input type="hidden" name="bookingId" value={rejecting.bookingId} />
            <div>
              <h2 id="reject-booking-change-title" className="font-bold">
                Từ chối thay đổi?
              </h2>
              <p className="mt-1 text-sm text-[#5c6665]">{rejecting.summary}</p>
            </div>
            <Field label="Lý do từ chối">
              <textarea name="reviewNote" required autoFocus rows={3} placeholder="Nhập lý do để lễ tân biết" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Btn type="button" variant="ghost" onClick={() => setRejecting(null)}>
                Quay lại
              </Btn>
              <Btn type="submit" variant="danger">
                Xác nhận từ chối
              </Btn>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
