import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveControlIssueAction } from "@/actions/control";
import { PendingSubmit } from "@/components/pending-submit";
import { Card, Chip, Empty } from "@/components/ui";
import {
  CONTROL_ISSUE_KINDS,
  CONTROL_ISSUE_LABEL,
  CONTROL_ISSUE_TONE,
  type ControlIssueKind,
} from "@/lib/control-issues";
import { getSession } from "@/lib/auth";
import { formatDateNumeric, formatDateTime } from "@/lib/datetime";
import { homePath } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { listControlIssues } from "@/lib/repos";
import { formatVnd } from "@/lib/sales";

function isIssueKind(value: string): value is ControlIssueKind {
  return (CONTROL_ISSUE_KINDS as readonly string[]).includes(value);
}

function issueDate(value?: string) {
  if (!value) return null;
  return value.length > 10 ? formatDateTime(value) : formatDateNumeric(value);
}

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; error?: string; resolved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewControl")) redirect(homePath(user.role));

  const { kind: rawKind = "", error, resolved } = await searchParams;
  const activeKind = isIssueKind(rawKind) ? rawKind : null;
  const issues = await listControlIssues();
  const counts = new Map<ControlIssueKind, number>();
  for (const issue of issues) counts.set(issue.kind, (counts.get(issue.kind) || 0) + 1);
  const visible = activeKind ? issues.filter((issue) => issue.kind === activeKind) : issues;

  return (
    <main className="space-y-4 px-3 py-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal">Quản lý</p>
        <h1 className="text-2xl font-bold">Kiểm soát</h1>
        <p className="mt-1 text-sm text-[#5c6665]">
          Chỉ booking nhận phòng từ 01/11/2026. Mỗi cảnh báo hết theo một trong hai cách: sửa booking để tự hết, hoặc ghi nhận đã xử lý kèm lý do. Khi còn lỗi, quản lý nhận một push tổng hợp mỗi 30 phút.
        </p>
      </header>

      {error ? <p className="rounded-xl bg-[#fde8e8] px-3 py-2 text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {resolved ? <p className="rounded-xl bg-[#e4f5eb] px-3 py-2 text-sm font-medium text-[#1b7a4e]">Đã ghi nhận xử lý cảnh báo.</p> : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Số cảnh báo theo loại">
        {CONTROL_ISSUE_KINDS.map((kind) => {
          const count = counts.get(kind) || 0;
          const active = activeKind === kind;
          return (
            <Link
              key={kind}
              href={active ? "/control" : `/control?kind=${kind}`}
              className={`card min-h-24 p-3 transition active:brightness-95 ${active ? "ring-2 ring-teal" : ""}`}
            >
              <p className="text-xs font-semibold text-[#5c6665]">{CONTROL_ISSUE_LABEL[kind]}</p>
              <p className={`mt-2 text-2xl font-bold ${count ? "text-[#c23b3b]" : "text-[#77807f]"}`}>{count}</p>
            </Link>
          );
        })}
      </section>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{activeKind ? CONTROL_ISSUE_LABEL[activeKind] : "Tất cả cảnh báo"}</h2>
            <p className="text-xs text-[#5c6665]">{visible.length} việc cần kiểm tra</p>
          </div>
          {activeKind ? <Link href="/control" className="text-sm font-semibold text-teal">Xem tất cả</Link> : null}
        </div>

        {visible.length ? (
          <div className="space-y-3">
            {visible.map((issue) => (
              <article key={issue.fingerprint} className="rounded-xl border border-line bg-sand p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={CONTROL_ISSUE_TONE[issue.kind]}>{CONTROL_ISSUE_LABEL[issue.kind]}</Chip>
                      {issue.amount ? <strong className="text-sm text-[#c23b3b]">{formatVnd(issue.amount)}</strong> : null}
                    </div>
                    <Link href={`/sales/bookings/${issue.bookingId}`} className="mt-2 block font-bold text-teal">
                      {issue.bookingCode} · {issue.guestName}
                    </Link>
                    <p className="mt-1 text-sm text-[#384241]">{issue.detail}</p>
                    <p className="mt-1 text-xs text-[#6b7372]">
                      {issue.roomLabel || "Chưa có phòng"}
                      {issueDate(issue.date) ? ` · ${issueDate(issue.date)}` : ""}
                    </p>
                  </div>
                  <Link href={`/sales/bookings/${issue.bookingId}`} className="shrink-0 text-xs font-semibold text-teal">
                    Sửa booking
                  </Link>
                </div>

                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <p className="text-xs text-[#5c6665]">Sửa booking để cảnh báo tự hết khi dữ liệu đúng.</p>
                  {issue.manualResolve ? (
                    <form action={resolveControlIssueAction} className="flex flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="fingerprint" value={issue.fingerprint} />
                      <input type="hidden" name="kind" value={activeKind || ""} />
                      <input
                        name="note"
                        required
                        minLength={3}
                        maxLength={500}
                        placeholder="Lý do đã xử lý thủ công..."
                        aria-label="Ghi chú xử lý"
                        className="min-w-0 flex-1"
                      />
                      <PendingSubmit variant="ghost" pendingLabel="Đang lưu..." className="sm:min-h-10">
                        Đã xử lý
                      </PendingSubmit>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={activeKind ? `Không có cảnh báo ${CONTROL_ISSUE_LABEL[activeKind].toLowerCase()}` : "Không còn cảnh báo"}
            text="Trang sẽ tự phát hiện lại khi dữ liệu phát sinh vấn đề."
          />
        )}
      </Card>
    </main>
  );
}
