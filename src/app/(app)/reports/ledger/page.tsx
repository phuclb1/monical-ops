import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { QueryForm, QuerySubmit } from "@/components/query-form";
import { Card, Chip, Empty, Field, ListPager, Stat, TabChip } from "@/components/ui";
import { ReportTabs } from "@/components/report-tabs";
import { getSession } from "@/lib/auth";
import { listPageSize, parsePage } from "@/lib/booking-desk";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatDateTime, formatPeriodLabel } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listLedgerPage } from "@/lib/repos";
import { BOOKING_TX_KIND_LABEL, BOOKING_TX_KINDS, formatVnd, isBookingTxKind, isPaymentMethod } from "@/lib/sales";
import { parsePeriodQuery, type ReportGrain } from "@/lib/sales-report";
import type { PaymentMethod } from "@/lib/types";

const GRAINS: { id: ReportGrain; label: string }[] = [
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "year", label: "Năm" },
];

const KIND_TONE: Record<string, "gold" | "ok" | "teal" | "danger"> = {
  deposit: "gold",
  checkin: "ok",
  payment: "ok",
  ota: "teal",
  refund: "danger",
};

type LedgerQuery = {
  grain: ReportGrain;
  date: string;
  page?: number;
  q?: string;
  kind?: string;
  method?: string;
};

function hrefFor(input: LedgerQuery) {
  const params = new URLSearchParams({ grain: input.grain, date: input.date });
  if ((input.page || 1) > 1) params.set("page", String(input.page));
  if (input.q) params.set("q", input.q);
  if (input.kind) params.set("kind", input.kind);
  if (input.method) params.set("method", input.method);
  return `/reports/ledger?${params}`;
}

function formatSigned(value: number) {
  const amount = Math.round(value || 0);
  const body = formatVnd(Math.abs(amount));
  return amount < 0 ? `−${body}` : body;
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string; page?: string; q?: string; kind?: string; method?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewLedger")) redirect("/more");
  const { grain: rawGrain, date: rawDate, page: rawPage, q: rawQ, kind: rawKind, method: rawMethod } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const q = rawQ?.trim() || "";
  const kind = isBookingTxKind(rawKind) ? rawKind : "";
  const method = isPaymentMethod(String(rawMethod || "")) ? (rawMethod as PaymentMethod) : "";
  const filtered = Boolean(q || kind || method);
  const year = window.from.slice(0, 4);
  const pageSize = listPageSize((await headers()).get("user-agent"));
  const ledger = await listLedgerPage({
    from: window.from,
    toExclusive: window.to,
    q,
    kind,
    method,
    page: parsePage(rawPage),
    pageSize,
  });
  const { rows, totals, bounds } = ledger;
  const pageRows = rows;
  const inflow = totals.inflow;
  const refund = totals.refund;
  const cash = totals.cash;
  const transfer = totals.transfer;
  const company = totals.company;
  const monthChips = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return { date: `${year}-${month}-01`, label: String(i + 1) };
  });
  const query: LedgerQuery = { grain, date: window.from, q, kind, method };

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Sổ cái</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">
          Từng lần thu / hoàn theo ngày giao dịch. Chỉ quản lý xem. Booking OTA công nợ chưa mark nhận thì không có dòng.
        </p>
      </div>

      <ReportTabs active="ledger" showSales />

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {GRAINS.map((item) => (
          <TabChip key={item.id} href={hrefFor({ ...query, grain: item.id, page: 1 })} active={grain === item.id}>
            {item.label}
          </TabChip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <PendingLink href={hrefFor({ ...query, date: window.prev, page: 1 })} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal" pendingLabel="…">
          ‹
        </PendingLink>
        <p className="text-center font-bold">{formatPeriodLabel(grain, window.from)}</p>
        <PendingLink href={hrefFor({ ...query, date: window.next, page: 1 })} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal" pendingLabel="…">
          ›
        </PendingLink>
      </div>

      {grain === "month" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {monthChips.map((item) => (
            <TabChip key={item.date} href={hrefFor({ ...query, grain: "month", date: item.date, page: 1 })} active={window.from === item.date}>
              {item.label}
            </TabChip>
          ))}
        </div>
      ) : null}
      {grain === "quarter" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {[1, 2, 3, 4].map((item) => {
            const qDate = `${year}-${String((item - 1) * 3 + 1).padStart(2, "0")}-01`;
            return (
              <TabChip key={item} href={hrefFor({ ...query, grain: "quarter", date: qDate, page: 1 })} active={window.from === qDate}>
                Quý {item}
              </TabChip>
            );
          })}
        </div>
      ) : null}

      <div className="revenue-stats">
        <Stat label="Thu" value={formatVnd(inflow)} />
        <Stat label="Hoàn" value={formatSigned(-refund)} tone="text-[#c23b3b]" />
        <Stat label="Ròng" value={formatSigned(inflow - refund)} />
        <Stat label="Tiền mặt" value={formatSigned(cash)} />
        <Stat label="CK cá nhân" value={formatSigned(transfer)} />
        <Stat label="CK công ty" value={formatSigned(company)} />
      </div>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        <TabChip href={hrefFor({ ...query, kind: "", page: 1 })} active={!kind}>
          Tất cả loại
        </TabChip>
        {BOOKING_TX_KINDS.map((item) => (
          <TabChip key={item} href={hrefFor({ ...query, kind: item, page: 1 })} active={kind === item}>
            {BOOKING_TX_KIND_LABEL[item]}
          </TabChip>
        ))}
      </div>

      <QueryForm action="/reports/ledger" className="card grid gap-3 p-3 md:grid-cols-[minmax(0,1.5fr)_1fr_auto] md:items-end md:p-4">
        <input type="hidden" name="grain" value={grain} />
        <input type="hidden" name="date" value={window.from} />
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <Field label="Tìm tên / booking">
          <input name="q" type="search" defaultValue={q} placeholder="Tên khách, mã, ghi chú…" autoComplete="off" enterKeyHint="search" />
        </Field>
        <Field label="Hình thức">
          <select name="method" defaultValue={method}>
            <option value="">Tất cả</option>
            <option value="cash">Tiền mặt</option>
            <option value="personal">CK cá nhân</option>
            <option value="company">CK công ty</option>
          </select>
        </Field>
        <div className="flex gap-2">
          <QuerySubmit pendingLabel="Đang lọc..." className="w-full md:w-auto md:px-6">
            Lọc
          </QuerySubmit>
          {filtered ? (
            <PendingLink href={hrefFor({ grain, date: window.from })} className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-teal">
              Xóa
            </PendingLink>
          ) : null}
        </div>
      </QueryForm>

      <Card className="!p-0">
        <div className="px-4 pt-4">
          <h2 className="mb-2 font-bold">Giao dịch ({bounds.total})</h2>
        </div>
        {pageRows.length ? (
          <div className="cash-flow-scroll">
            <table className="cash-tx-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th className="is-name">Khách</th>
                  <th>Mã</th>
                  <th className="is-room">Phòng</th>
                  <th>Loại</th>
                  <th>Hình thức</th>
                  <th className="is-num">Số tiền</th>
                  <th>Ghi chú</th>
                  <th>Bill</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.paidAt)}</td>
                    <td className="is-name">
                      <Link href={`/sales/bookings/${row.bookingId}`} prefetch={false} className="font-bold text-teal">
                        {row.guestName}
                      </Link>
                    </td>
                    <td>{row.bookingCode}</td>
                    <td className="is-room">{row.rooms || "—"}</td>
                    <td>
                      <Chip tone={KIND_TONE[row.kind] || "neutral"}>
                        {isBookingTxKind(row.kind) ? BOOKING_TX_KIND_LABEL[row.kind] : row.kind}
                      </Chip>
                    </td>
                    <td>{PAYMENT_METHOD_LABEL[row.method as PaymentMethod] || row.method}</td>
                    <td className={`is-num${row.signedAmount < 0 ? " text-[#c23b3b]" : ""}`}>{formatSigned(row.signedAmount)}</td>
                    <td>{row.note || "—"}</td>
                    <td>
                      {row.photo ? (
                        <a href={row.photo} target="_blank" rel="noreferrer" className="font-semibold text-teal">
                          Ảnh
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Tổng kỳ</td>
                  <td className="is-name">{bounds.total} dòng</td>
                  <td />
                  <td className="is-room" />
                  <td />
                  <td />
                  <td className="is-num">{formatSigned(inflow - refund)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <Empty
              title={filtered ? "Không khớp lọc" : "Chưa có giao dịch trong kỳ"}
              text={filtered ? "Đổi loại, hình thức hoặc từ khóa." : "Đổi tháng / quý / năm."}
            />
          </div>
        )}
        {bounds.pages > 1 ? (
          <div className="px-4 py-3">
            <ListPager
              page={bounds.page}
              pages={bounds.pages}
              from={bounds.from}
              to={bounds.to}
              total={bounds.total}
              hrefFor={(next) => hrefFor({ ...query, page: next })}
            />
          </div>
        ) : null}
      </Card>
    </main>
  );
}
