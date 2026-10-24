import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, ListPager, Stat, TabChip } from "@/components/ui";
import { ReportTabs } from "@/components/report-tabs";
import { getSession } from "@/lib/auth";
import { listPageSize, pageBounds, parsePage } from "@/lib/booking-desk";
import { PAYMENT_METHOD_LABEL, SALE_SOURCE_LABEL } from "@/lib/constants";
import { formatDateNumeric, formatPeriodLabel } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookingTransactions, listCashPeriodBookings } from "@/lib/repos";
import { bookingDisplayCode, formatVnd, refundReasonLabel } from "@/lib/sales";
import {
  CASH_FLOW_KIND_LABEL,
  actualCashFlowReport,
  cashFlowReport,
  filterActualCashFlow,
  filterCashFlowReport,
  parseIsoDate,
  parsePeriodQuery,
  type ActualCashKind,
  type ActualCashTx,
  type ReportGrain,
} from "@/lib/sales-report";
import type { SaleSource } from "@/lib/types";

const GRAINS: { id: ReportGrain; label: string }[] = [
  { id: "month", label: "Tháng" },
  { id: "quarter", label: "Quý" },
  { id: "year", label: "Năm" },
];

const KIND_TONE: Record<ActualCashKind, "gold" | "ok" | "teal" | "danger"> = {
  deposit: "gold",
  checkin: "ok",
  payment: "ok",
  ota: "teal",
  extra: "teal",
  refund: "danger",
};

type CashView = "summary" | "actual";
type CashGroup = "tx" | "booking";

type CashQuery = {
  grain: ReportGrain;
  date: string;
  page?: number;
  view?: CashView;
  group?: CashGroup;
  q?: string;
  arrive?: string;
  depart?: string;
};

function hrefFor(input: CashQuery) {
  const params = new URLSearchParams({ grain: input.grain, date: input.date });
  if ((input.page || 1) > 1) params.set("page", String(input.page));
  if (input.view === "actual") params.set("view", "actual");
  if (input.group === "booking") params.set("group", "booking");
  if (input.q) params.set("q", input.q);
  if (input.arrive) params.set("arrive", input.arrive);
  if (input.depart) params.set("depart", input.depart);
  return `/reports/cash?${params}`;
}

function exportHref(input: CashQuery) {
  const params = new URLSearchParams({ grain: input.grain, date: input.date });
  if (input.q) params.set("q", input.q);
  if (input.arrive) params.set("arrive", input.arrive);
  if (input.depart) params.set("depart", input.depart);
  return `/api/reports/cash/export?${params}`;
}

function formatFlowVnd(value: number) {
  const amount = Math.round(value || 0);
  const body = new Intl.NumberFormat("vi-VN").format(Math.abs(amount));
  return amount < 0 ? `−${body}₫` : `${body}₫`;
}

function txCells(row: ActualCashTx, hideBooking: boolean) {
  return {
    code: hideBooking ? "" : row.bookingCode,
    name: hideBooking ? "" : row.guestName,
    rooms: hideBooking ? "" : row.roomLabel,
    checkIn: hideBooking ? "" : formatDateNumeric(row.checkIn),
    checkOut: hideBooking ? "" : formatDateNumeric(row.checkOut),
  };
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string; page?: string; view?: string; group?: string; q?: string; arrive?: string; depart?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewSalesRevenue")) redirect("/more");
  const { grain: rawGrain, date: rawDate, page: rawPage, view: rawView, group: rawGroup, q: rawQ, arrive: rawArrive, depart: rawDepart } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const view: CashView = rawView === "actual" ? "actual" : "summary";
  const group: CashGroup = rawGroup === "booking" ? "booking" : "tx";
  const q = rawQ?.trim() || "";
  const arrive = parseIsoDate(rawArrive);
  const depart = parseIsoDate(rawDepart);
  const filtered = Boolean(q || arrive || depart);
  const year = window.from.slice(0, 4);
  const bookings = await listCashPeriodBookings(window.from, window.to);
  const period = cashFlowReport(bookings, window.from, window.to);
  const report = filterCashFlowReport(period, { q, arrive, depart });
  const txs = view === "actual" ? await listBookingTransactions(bookings.map((row) => row.id)) : [];
  const txByBooking = new Map<string, typeof txs>();
  for (const tx of txs) {
    const list = txByBooking.get(tx.bookingId) || [];
    list.push(tx);
    txByBooking.set(tx.bookingId, list);
  }
  const actualBookings = view === "actual"
    ? bookings.map((booking) => {
        const list = txByBooking.get(booking.id) || [];
        return { ...booking, transactions: list.length ? list : undefined };
      })
    : [];
  const actual = filterActualCashFlow(actualCashFlowReport(actualBookings, window.from, window.to), { q, arrive, depart });
  const pageSize = listPageSize((await headers()).get("user-agent"));
  const summaryBounds = pageBounds(report.rows.length, parsePage(rawPage), pageSize);
  const actualBounds = pageBounds(group === "booking" ? actual.groups.length : actual.rows.length, parsePage(rawPage), pageSize);
  const rows = report.rows.slice(summaryBounds.start, summaryBounds.start + summaryBounds.take);
  const actualRows = actual.rows.slice(actualBounds.start, actualBounds.start + actualBounds.take);
  const actualGroups = actual.groups.slice(actualBounds.start, actualBounds.start + actualBounds.take);
  const monthChips = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return { date: `${year}-${month}-01`, label: String(i + 1) };
  });
  const totals = period.totals;
  const query = { grain, date: window.from, view, group, q, arrive, depart };

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo dòng tiền</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">
            Theo ngày nhận trong kỳ, gồm booking chưa đến ngày nhận. Giá booking đã gồm VAT 8%; VAT tách riêng để khấu trừ sau. Tiền mặt, CK cá nhân và CK công ty là tiền đã thu. Hoàn cọc ghi âm vào đúng tài khoản đã nhận, theo ngày hoàn. OTA công nợ thành phải thu sau hoa hồng; hoa hồng OTA đã trừ ghi riêng. OTA thu tại khách sạn giữ tiền đã thu và ghi hoa hồng vào phải trả.
          </p>
        </div>
        <a
          href={exportHref(query)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-teal px-3 text-sm font-semibold text-white"
        >
          Xuất Excel
        </a>
      </div>

      <ReportTabs active="cash" showSales />

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {GRAINS.map((item) => (
          <TabChip key={item.id} href={hrefFor({ ...query, grain: item.id, page: 1 })} active={grain === item.id}>
            {item.label}
          </TabChip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link href={hrefFor({ ...query, date: window.prev, page: 1 })} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
          ‹
        </Link>
        <p className="text-center font-bold">{formatPeriodLabel(grain, window.from)}</p>
        <Link href={hrefFor({ ...query, date: window.next, page: 1 })} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
          ›
        </Link>
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
          {[1, 2, 3, 4].map((q) => {
            const qDate = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
            return (
              <TabChip key={q} href={hrefFor({ ...query, grain: "quarter", date: qDate, page: 1 })} active={window.from === qDate}>
                Quý {q}
              </TabChip>
            );
          })}
        </div>
      ) : null}

      <div className="revenue-stats">
        <Stat label="Tổng gồm VAT" value={formatVnd(totals.gross)} />
        <Stat label="Chưa VAT" value={formatVnd(totals.net)} />
        <Stat label="VAT 8%" value={formatVnd(totals.vat)} />
        <Stat label="Tiền mặt" value={formatFlowVnd(totals.cash)} />
        <Stat label="CK cá nhân" value={formatFlowVnd(totals.transfer)} />
        <Stat label="CK công ty" value={formatFlowVnd(totals.company)} />
        <Stat label="Phải thu OTA" value={formatVnd(totals.receivable)} tone="text-[#c47b12]" />
        <Stat label="Hoa hồng đã khấu trừ" value={formatVnd(totals.withheld)} tone="text-[#c47b12]" />
        <Stat label="Phải trả hoa hồng" value={formatVnd(totals.payable)} tone="text-[#c47b12]" />
        <Stat label="Khách còn nợ" value={formatVnd(totals.guestDue)} />
      </div>

      <p className="text-xs text-[#5c6665]">
        {totals.count || totals.refundCount
          ? `${totals.count} booking nhận trong kỳ${totals.refundCount ? ` · ${totals.refundCount} hoàn cọc` : ""}${totals.count ? `, ${totals.recognizedCount} đã đến ngày ghi nhận` : ""}.`
          : "Chưa có booking nhận trong kỳ. Đổi tháng / quý / năm."}
      </p>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        <TabChip href={hrefFor({ ...query, view: "summary", page: 1 })} active={view === "summary"}>
          Tổng hợp
        </TabChip>
        <TabChip href={hrefFor({ ...query, view: "actual", page: 1 })} active={view === "actual"}>
          Dòng tiền thực tế
        </TabChip>
      </div>

      <form className="card grid gap-3 p-3 md:grid-cols-[minmax(0,1.5fr)_1fr_1fr_auto] md:items-end md:p-4">
        <input type="hidden" name="grain" value={grain} />
        <input type="hidden" name="date" value={window.from} />
        {view === "actual" ? <input type="hidden" name="view" value="actual" /> : null}
        {group === "booking" ? <input type="hidden" name="group" value="booking" /> : null}
        <Field label="Tìm tên / booking">
          <input name="q" type="search" defaultValue={q} placeholder="Tên khách, mã booking…" autoComplete="off" enterKeyHint="search" />
        </Field>
        <Field label="Ngày đến">
          <input name="arrive" type="date" defaultValue={arrive} />
        </Field>
        <Field label="Ngày đi">
          <input name="depart" type="date" defaultValue={depart} />
        </Field>
        <div className="flex gap-2">
          <Btn type="submit" variant="ghost" className="w-full md:w-auto md:px-6">
            Lọc
          </Btn>
          {filtered ? (
            <Link
              href={hrefFor({ grain, date: window.from, view, group })}
              className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-teal"
            >
              Xóa
            </Link>
          ) : null}
        </div>
      </form>

      {view === "summary" ? (
      <Card className="!p-0">
        <div className="px-4 pt-4">
          <h2 className="mb-2 font-bold">Chi tiết ({report.rows.length})</h2>
        </div>
        {report.rows.length ? (
          <div className="cash-flow-scroll">
            <table className="cash-flow-table">
              <thead>
                <tr>
                  <th>Tên khách</th>
                  <th>Mã</th>
                  <th>Nguồn</th>
                  <th>Hình thức</th>
                  <th>Ngày tạo</th>
                  <th>Ngày ghi nhận</th>
                  <th>Ghi nhận</th>
                  <th className="is-num">Tổng gồm VAT</th>
                  <th className="is-num">Chưa VAT</th>
                  <th className="is-num">VAT</th>
                  <th className="is-num">Tiền mặt</th>
                  <th className="is-num">CK cá nhân</th>
                  <th className="is-num">CK công ty</th>
                  <th className="is-num">Phải thu OTA</th>
                  <th className="is-num">Hoa hồng đã khấu trừ</th>
                  <th className="is-num">Phải trả hoa hồng</th>
                  <th className="is-num">Khách còn nợ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ booking, flow }) => (
                  <tr key={`${booking.id}-${flow.refund ? "refund" : "stay"}`}>
                    <td>
                      <Link href={`/sales/bookings/${booking.id}`} prefetch={false} className="font-bold text-teal">
                        {booking.guestName}
                      </Link>
                    </td>
                    <td>{bookingDisplayCode(booking)}</td>
                    <td>{SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source}</td>
                    <td>{CASH_FLOW_KIND_LABEL[flow.kind]}</td>
                    <td>{formatDateNumeric(booking.createdAt)}</td>
                    <td>{formatDateNumeric(flow.refund ? booking.refundedAt || booking.checkIn : booking.checkIn)}</td>
                    <td>
                      {flow.refund ? (
                        <Chip tone="danger">{refundReasonLabel(booking.refundReason)}</Chip>
                      ) : (
                        <Chip tone={flow.recognized ? "ok" : "gold"}>{flow.recognized ? "Đã ghi nhận" : "Chưa ghi nhận"}</Chip>
                      )}
                    </td>
                    <td className="is-num">{formatVnd(flow.gross)}</td>
                    <td className="is-num">{formatVnd(flow.net)}</td>
                    <td className="is-num">{formatVnd(flow.vat)}</td>
                    <td className="is-num">{formatFlowVnd(flow.cash)}</td>
                    <td className="is-num">{formatFlowVnd(flow.transfer)}</td>
                    <td className="is-num">{formatFlowVnd(flow.company)}</td>
                    <td className="is-num">{formatVnd(flow.receivable)}</td>
                    <td className="is-num">{formatVnd(flow.withheld)}</td>
                    <td className="is-num">{formatVnd(flow.payable)}</td>
                    <td className="is-num">{formatVnd(flow.guestDue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Tổng kỳ</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="is-num">{formatVnd(report.totals.gross)}</td>
                  <td className="is-num">{formatVnd(report.totals.net)}</td>
                  <td className="is-num">{formatVnd(report.totals.vat)}</td>
                  <td className="is-num">{formatFlowVnd(report.totals.cash)}</td>
                  <td className="is-num">{formatFlowVnd(report.totals.transfer)}</td>
                  <td className="is-num">{formatFlowVnd(report.totals.company)}</td>
                  <td className="is-num">{formatVnd(report.totals.receivable)}</td>
                  <td className="is-num">{formatVnd(report.totals.withheld)}</td>
                  <td className="is-num">{formatVnd(report.totals.payable)}</td>
                  <td className="is-num">{formatVnd(report.totals.guestDue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <Empty
              title={filtered ? "Không khớp tìm kiếm / lọc ngày" : "Không có booking nhận trong kỳ"}
              text={filtered ? "Đổi tên, mã booking hoặc ngày đến / ngày đi." : "Đổi tháng / quý / năm."}
            />
          </div>
        )}
        {summaryBounds.pages > 1 ? (
          <div className="px-4 py-3">
            <ListPager
              page={summaryBounds.page}
              pages={summaryBounds.pages}
              from={summaryBounds.from}
              to={summaryBounds.to}
              total={summaryBounds.total}
              hrefFor={(next) => hrefFor({ ...query, page: next })}
            />
          </div>
        ) : null}
      </Card>
      ) : (
      <Card className="!p-0">
        <div className="px-4 pt-4">
          <h2 className="mb-2 font-bold">Dòng tiền thực tế ({actual.totals.count})</h2>
          <p className="mb-3 text-xs text-[#5c6665]">
            Mỗi dòng là một khoản đã thu hoặc hoàn: đặt cọc, thu đủ, phụ thu đã thu, hoàn cọc. Có thể gộp theo booking.
          </p>
          <div className="tab-scroller pb-2">
            <TabChip href={hrefFor({ ...query, group: "tx", page: 1 })} active={group === "tx"}>
              Từng giao dịch
            </TabChip>
            <TabChip href={hrefFor({ ...query, group: "booking", page: 1 })} active={group === "booking"}>
              Theo booking
            </TabChip>
          </div>
        </div>
        {actual.rows.length ? (
          <div className="cash-flow-scroll">
            <table className="cash-tx-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th className="is-name">Họ tên</th>
                  <th className="is-room">Số phòng</th>
                  <th>Ngày đến</th>
                  <th>Ngày đi</th>
                  <th className="is-num">Số tiền</th>
                  <th>Loại</th>
                  <th>Hình thức</th>
                </tr>
              </thead>
              <tbody>
                {group === "booking"
                  ? actualGroups.flatMap((item, groupIndex) => [
                      ...item.rows.map((row, index) => {
                        const cells = txCells(row, index > 0);
                        return (
                          <tr key={row.id} className={index === 0 && groupIndex > 0 ? "is-group-start" : undefined}>
                            <td>
                              {index === 0 ? (
                                <Link href={`/sales/bookings/${row.bookingId}`} prefetch={false} className="font-bold text-teal">
                                  {row.bookingCode}
                                </Link>
                              ) : (
                                cells.code
                              )}
                            </td>
                            <td className="is-name">{cells.name}</td>
                            <td className="is-room">{cells.rooms}</td>
                            <td>{cells.checkIn}</td>
                            <td>{cells.checkOut}</td>
                            <td className="is-num">{formatFlowVnd(row.amount)}</td>
                            <td>
                              <Chip tone={KIND_TONE[row.kind]}>{row.typeLabel}</Chip>
                            </td>
                            <td>{PAYMENT_METHOD_LABEL[row.method]}</td>
                          </tr>
                        );
                      }),
                      <tr key={`${item.bookingId}-total`} className="is-subtotal">
                        <td />
                        <td className="is-name">Tổng</td>
                        <td className="is-room" />
                        <td />
                        <td />
                        <td className="is-num">{formatFlowVnd(item.amount)}</td>
                        <td />
                        <td />
                      </tr>,
                    ])
                  : actualRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/sales/bookings/${row.bookingId}`} prefetch={false} className="font-bold text-teal">
                            {row.bookingCode}
                          </Link>
                        </td>
                        <td className="is-name">{row.guestName}</td>
                        <td className="is-room">{row.roomLabel}</td>
                        <td>{formatDateNumeric(row.checkIn)}</td>
                        <td>{formatDateNumeric(row.checkOut)}</td>
                        <td className="is-num">{formatFlowVnd(row.amount)}</td>
                        <td>
                          <Chip tone={KIND_TONE[row.kind]}>{row.typeLabel}</Chip>
                        </td>
                        <td>{PAYMENT_METHOD_LABEL[row.method]}</td>
                      </tr>
                    ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Tổng kỳ</td>
                  <td className="is-name">{actual.totals.bookingCount} booking</td>
                  <td className="is-room" />
                  <td />
                  <td />
                  <td className="is-num">{formatFlowVnd(actual.totals.amount)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <Empty
              title={filtered ? "Không khớp tìm kiếm / lọc ngày" : "Không có giao dịch thu trong kỳ"}
              text={filtered ? "Đổi tên, mã booking hoặc ngày đến / ngày đi." : "Đổi tháng / quý / năm."}
            />
          </div>
        )}
        {actualBounds.pages > 1 ? (
          <div className="px-4 py-3">
            <ListPager
              page={actualBounds.page}
              pages={actualBounds.pages}
              from={actualBounds.from}
              to={actualBounds.to}
              total={actualBounds.total}
              hrefFor={(next) => hrefFor({ ...query, page: next })}
            />
          </div>
        ) : null}
      </Card>
      )}
    </main>
  );
}
