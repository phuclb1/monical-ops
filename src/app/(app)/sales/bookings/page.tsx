import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookingLifeChips } from "@/components/booking-lifecycle";
import { QueryForm, QuerySubmit } from "@/components/query-form";
import { Card, Empty, Field, ListPager, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { listPageSize, normalizeBookingDeskTab, normalizeBookingSearchScope, parsePage, type BookingDeskTab, type BookingSearchScope } from "@/lib/booking-desk";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL } from "@/lib/constants";
import { addDaysVN, addMonthsVN, formatDateLong, formatDateNumeric, startOfMonthVN, todayVN } from "@/lib/datetime";
import { maskName } from "@/lib/mask";
import { can } from "@/lib/permissions";
import { listBookingDesk } from "@/lib/repos";
import { bookingLifecycle, formatVnd, isBookingListView, isOpsBookingCode, isOtaDebt, isOtaSource, otaMoneySplit, type BookingListView } from "@/lib/sales";
import type { SaleOrigin, SaleSource } from "@/lib/types";

const VIEWS = [
  { id: "new", label: "Tất cả" },
  { id: "month", label: "In tháng này" },
  { id: "checkin", label: "In hôm nay" },
  { id: "stay", label: "Ở hôm nay" },
  { id: "checkout", label: "Out hôm nay" },
  { id: "tomorrow", label: "In ngày mai" },
] as const;

const TABS = [
  { id: "active", label: "Đang mở" },
  { id: "reserved", label: "Giữ chỗ" },
  { id: "inhouse", label: "Đã check-in" },
] as const;

const FINDS = [
  { id: "open", label: "Giữ chỗ" },
  { id: "departed", label: "Đã trả" },
  { id: "all", label: "Tất cả" },
] as const;

function bookingsHref(view: BookingListView, tab: BookingDeskTab, q: string, page = 1, find: BookingSearchScope = "open") {
  const params = new URLSearchParams();
  if (view !== "new") params.set("view", view);
  if (tab !== "active" && find === "open") params.set("tab", tab);
  if (q) params.set("q", q);
  if (q && find !== "open") params.set("find", find);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/sales/bookings?${text}` : "/sales/bookings";
}

function channelLabel(source: string) {
  return isOtaSource(source) ? "OTA" : "Trực tiếp";
}

function dueLabel(row: {
  source: string;
  otaPaymentMode?: string | null;
  due: number;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  deposit?: number | null;
  refundTotal?: number | null;
}) {
  if (!isOtaDebt(row.source, row.otaPaymentMode)) {
    return isOtaSource(row.source) ? `Còn khách thanh toán ${formatVnd(row.due)}` : `Còn ${formatVnd(row.due)}`;
  }
  const split = otaMoneySplit({
    source: row.source,
    otaPaymentMode: row.otaPaymentMode,
    roomTotal: row.roomTotal,
    extrasTotal: row.extrasTotal,
    deposit: row.deposit,
    refunded: row.refundTotal,
  });
  if (split.extrasTotal && (split.otaDue > 0 || split.guestDue > 0)) {
    const parts = [
      split.otaDue > 0 ? `Công nợ OTA ${formatVnd(split.otaDue)}` : null,
      split.guestDue > 0 ? `Phụ thu ${formatVnd(split.guestDue)}` : null,
    ].filter(Boolean);
    return parts.join(" · ") || `Công nợ OTA ${formatVnd(0)}`;
  }
  return `Công nợ OTA ${formatVnd(split.otaDue || row.due)}`;
}

function invoiceLabel(row: { invoiceRequested?: boolean | null; rooms?: { invoiceRequested?: boolean | null }[] }) {
  const on = Boolean(row.invoiceRequested) || Boolean(row.rooms?.some((room) => room.invoiceRequested));
  return on ? "Có" : "Không";
}

function viewHint(view: BookingListView, today: string) {
  const tomorrow = addDaysVN(today, 1);
  const monthStart = startOfMonthVN(today);
  const monthEnd = addDaysVN(addMonthsVN(monthStart, 1), -1);
  if (view === "month") return `Nhận phòng từ ${formatDateNumeric(monthStart)} đến ${formatDateNumeric(monthEnd)}.`;
  if (view === "checkin") return `Nhận phòng ${formatDateLong(today)}. Booking nhiều phòng hiện khi có ít nhất một phòng nhận hôm nay.`;
  if (view === "stay") return `Đang ở ${formatDateLong(today)}: nhận từ hôm nay trở về trước, trả sau hôm nay.`;
  if (view === "checkout") return `Trả phòng ${formatDateLong(today)}. Chỉ booking còn giữ chỗ hoặc đang ở, không gồm đã trả.`;
  if (view === "tomorrow") return `Nhận phòng ${formatDateLong(tomorrow)}.`;
  return null;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; view?: string; page?: string; find?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const manage = can(user.role, "manageSales");
  if (!manage && !can(user.role, "viewBookings")) redirect("/more");
  const showNames = can(user.role, "viewGuestPii");
  const guestLabel = (name: string) => (showNames ? name : maskName(name, user.role));
  const { tab: rawTab, q: rawQ, view: rawView, page: rawPage, find: rawFind } = await searchParams;
  const viewValue = rawView || "";
  const tab = normalizeBookingDeskTab(rawTab);
  const view = isBookingListView(viewValue) ? viewValue : "new";
  const q = (rawQ || "").trim();
  const find = q ? normalizeBookingSearchScope(rawFind) : "open";
  const today = todayVN();
  const hint = viewHint(view, today);
  const pageSize = listPageSize((await headers()).get("user-agent"));
  const desk = await listBookingDesk({ tab, view, q, find, page: parsePage(rawPage), pageSize, today });
  const { rows, counts, viewCounts, page, pages, total, from, to } = desk;

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h1 className="text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">
            Giữ chỗ và đã check-in, mới tạo trước. Quick pick thu hẹp theo ngày nhận, đang ở, hoặc ngày trả.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
          {manage ? (
            <Link href="/sales/new" className="cta-link">
              Đặt mới
            </Link>
          ) : null}
          <Link href="/sales" className="flex min-h-11 items-center text-sm font-semibold text-teal">
            Sơ đồ phòng
          </Link>
          {can(user.role, "viewSalesRevenue") ? (
            <Link href="/reports" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Báo cáo
            </Link>
          ) : null}
        </div>
      </div>

      <QueryForm action="/sales/bookings" className="card p-3 md:flex md:items-end md:gap-3 md:p-4">
        <div className="md:min-w-0 md:flex-1">
          <Field label="Tìm booking">
            <input
              name="q"
              type="search"
              defaultValue={rawQ || ""}
              placeholder="Tên, SĐT, phòng, mã, ghi chú, nguồn…"
              autoComplete="off"
              enterKeyHint="search"
            />
          </Field>
        </div>
        <div className="mt-2 md:mt-0 md:w-40">
          <Field label="Tìm trong">
            <select name="find" defaultValue={find === "open" ? "" : find}>
              {FINDS.map((item) => (
                <option key={item.id} value={item.id === "open" ? "" : item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {view !== "new" ? <input type="hidden" name="view" value={view} /> : null}
        {tab !== "active" && find === "open" ? <input type="hidden" name="tab" value={tab} /> : null}
        <div className="mt-2 flex gap-2 md:mt-0">
          <QuerySubmit pendingLabel="Đang tìm..." className="w-full md:w-auto md:px-6">
            Tìm
          </QuerySubmit>
          {q ? (
            <Link
              href={bookingsHref(view, tab, "", 1, "open")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-teal"
            >
              Xóa
            </Link>
          ) : null}
        </div>
      </QueryForm>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {VIEWS.map((item) => (
          <TabChip key={item.id} href={bookingsHref(item.id, tab, q, 1, find)} active={view === item.id}>
            {item.label} · {viewCounts[item.id]}
          </TabChip>
        ))}
      </div>
      {find === "open" ? (
        <div className="tab-scroller -mx-3 px-3 pb-1">
          {TABS.map((item) => (
            <TabChip key={item.id} href={bookingsHref(view, item.id, q, 1, find)} active={tab === item.id}>
              {item.label} · {counts[item.id]}
            </TabChip>
          ))}
        </div>
      ) : null}
      {hint ? <p className="text-xs text-[#5c6665]">{hint}</p> : null}
      {q ? (
        <p className="text-xs text-[#5c6665]">
          {total} kết quả trong {FINDS.find((item) => item.id === find)?.label} khớp “{q}”
        </p>
      ) : null}

      {rows.length ? (
        <>
          <div className="booking-list-cards space-y-2">
            {rows.map((row) => (
              <Link key={row.id} href={`/sales/bookings/${row.id}`} prefetch={false} className="block">
                <Card className="min-h-16">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{guestLabel(row.guestName)}</p>
                      <p className="text-xs text-[#5c6665]">
                        {row.roomCount} phòng · {row.roomLabel}
                      </p>
                      <p className="mt-1 text-xs text-[#5c6665]">
                        {formatDateLong(row.checkIn)} → {formatDateLong(row.checkOut)} · {SALE_SOURCE_LABEL[row.source as SaleSource] || row.source} · {SALE_ORIGIN_LABEL[(row.origin as SaleOrigin) || "ops"]}
                      </p>
                      <p className="mt-1 text-xs text-[#5c6665]">
                        Tạo {formatDateNumeric(row.createdAt)} · {channelLabel(row.source)} · Hóa đơn {invoiceLabel(row)}
                      </p>
                      {row.pmsCode ? (
                        <p className="mt-1 text-xs text-[#5c6665]">
                          {isOpsBookingCode(row.pmsCode) ? "Mã Ops" : "PMS"} {row.pmsCode}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <BookingLifeChips life={bookingLifecycle(row)} />
                      <span className="text-xs text-[#5c6665]">Phải thu {formatVnd(row.total)}</span>
                      <span className="text-xs font-semibold">{dueLabel(row)}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          <div className="booking-list-table">
            <div className="booking-list-head">
              <span>Khách</span>
              <span>Phòng</span>
              <span>Ngày ở</span>
              <span>Ngày tạo</span>
              <span>Kênh</span>
              <span>Hóa đơn</span>
              <span>Nguồn</span>
              <span>Trạng thái</span>
              <span className="booking-list-money">Còn thu</span>
            </div>
            {rows.map((row) => (
              <Link key={row.id} href={`/sales/bookings/${row.id}`} prefetch={false} className="booking-list-row">
                <div className="min-w-0">
                  <p className="truncate font-bold">{guestLabel(row.guestName)}</p>
                  {row.pmsCode ? (
                    <p className="truncate text-xs text-[#5c6665]">
                      {isOpsBookingCode(row.pmsCode) ? "Ops" : "PMS"} {row.pmsCode}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{row.roomCount} phòng</p>
                  <p className="truncate text-xs text-[#5c6665]">{row.roomLabel}</p>
                </div>
                <div>
                  <p>
                    {formatDateNumeric(row.checkIn)} → {formatDateNumeric(row.checkOut)}
                  </p>
                  <p className="text-xs text-[#5c6665]">{row.nights} đêm</p>
                </div>
                <p className="whitespace-nowrap text-sm">{formatDateNumeric(row.createdAt)}</p>
                <p className="text-sm font-semibold">{channelLabel(row.source)}</p>
                <p className="text-sm">{invoiceLabel(row)}</p>
                <p className="text-sm">{SALE_SOURCE_LABEL[row.source as SaleSource] || row.source}</p>
                <div className="flex flex-col items-start gap-1">
                  <BookingLifeChips life={bookingLifecycle(row)} />
                </div>
                <div className="booking-list-money">
                  <p className="whitespace-nowrap text-xs text-[#5c6665]">{formatVnd(row.total)}</p>
                  <p className="whitespace-nowrap font-bold">{formatVnd(row.due)}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title="Không có booking khớp"
          text={
            view === "month"
              ? "Không có booking nhận phòng trong tháng này. Đổi quick pick hoặc về Tất cả."
              : view === "checkin"
                ? "Không có phòng nhận hôm nay. Đổi quick pick hoặc về Tất cả."
                : view === "stay"
                  ? "Không có phòng đang ở hôm nay. Đổi quick pick hoặc về Tất cả."
                  : view === "checkout"
                    ? "Không có phòng trả hôm nay còn giữ chỗ hoặc đang ở."
                    : view === "tomorrow"
                      ? "Không có phòng nhận ngày mai. Đổi quick pick hoặc về Tất cả."
                      : q
                        ? find === "departed"
                          ? "Không thấy trong booking đã trả. Đổi từ khóa hoặc chọn Tất cả."
                          : find === "all"
                            ? "Không thấy trong mọi trạng thái. Đổi từ khóa."
                            : "Đổi từ khóa hoặc chọn Đã trả / Tất cả. Có thể tìm tên (không dấu), SĐT, phòng, mã, ghi chú, nguồn."
                        : manage
                          ? "Bấm Đặt mới để tạo booking."
                          : "Đổi quick pick hoặc trạng thái."
          }
        />
      )}
      <ListPager page={page} pages={pages} from={from} to={to} total={total} hrefFor={(next) => bookingsHref(view, tab, q, next, find)} />
    </main>
  );
}
