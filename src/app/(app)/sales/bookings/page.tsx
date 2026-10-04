import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, formatDateNumeric, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { bookingMatchesListView, formatVnd, isBookingListView, isOpsBookingCode, isOtaDebt, isOtaSource, matchesBookingSearch, paidNote, type BookingListView } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const VIEWS = [
  { id: "new", label: "Mới nhất" },
  { id: "checkin", label: "Check-in hôm nay" },
  { id: "checkout", label: "Check-out hôm nay" },
] as const;

const TABS = [
  { id: "open", label: "Đang mở / đã trả" },
  { id: "reserved", label: "Giữ chỗ" },
  { id: "inhouse", label: "Đang ở" },
  { id: "done", label: "Đã đóng" },
  { id: "all", label: "Tất cả" },
] as const;

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

function isTab(value: string): value is (typeof TABS)[number]["id"] {
  return TABS.some((tab) => tab.id === value);
}

function bookingsHref(view: BookingListView, tab: (typeof TABS)[number]["id"], q: string) {
  const params = new URLSearchParams();
  if (view !== "new") params.set("view", view);
  if (tab !== "open") params.set("tab", tab);
  if (q) params.set("q", q);
  const text = params.toString();
  return text ? `/sales/bookings?${text}` : "/sales/bookings";
}

function channelLabel(source: string) {
  return isOtaSource(source) ? "OTA" : "Trực tiếp";
}

function invoiceLabel(row: { invoiceRequested?: boolean | null; rooms?: { invoiceRequested?: boolean | null }[] }) {
  const on = Boolean(row.invoiceRequested) || Boolean(row.rooms?.some((room) => room.invoiceRequested));
  return on ? "Có" : "Không";
}

function matchesTab(status: string, tab: (typeof TABS)[number]["id"]) {
  if (tab === "open") return status === "reserved" || status === "inhouse" || status === "departed";
  if (tab === "reserved") return status === "reserved";
  if (tab === "inhouse") return status === "inhouse";
  if (tab === "done") return status === "departed" || status === "cancelled" || status === "no_show";
  return true;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; view?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { tab: rawTab, q: rawQ, view: rawView } = await searchParams;
  const tabValue = rawTab || "";
  const viewValue = rawView || "";
  const tab = isTab(tabValue) ? tabValue : "open";
  const view = isBookingListView(viewValue) ? viewValue : "new";
  const q = (rawQ || "").trim();
  const today = todayVN();
  const bookings = await listBookings();
  const matched = q ? bookings.filter((row) => matchesBookingSearch(row, q)) : bookings;
  const viewed = matched.filter((row) => bookingMatchesListView(row, view, today));
  const counts = {
    open: viewed.filter((row) => matchesTab(row.status, "open")).length,
    reserved: viewed.filter((row) => matchesTab(row.status, "reserved")).length,
    inhouse: viewed.filter((row) => matchesTab(row.status, "inhouse")).length,
    done: viewed.filter((row) => matchesTab(row.status, "done")).length,
    all: viewed.length,
  };
  const viewCounts = {
    new: matched.filter((row) => matchesTab(row.status, tab)).length,
    checkin: matched.filter((row) => matchesTab(row.status, tab) && bookingMatchesListView(row, "checkin", today)).length,
    checkout: matched.filter((row) => matchesTab(row.status, tab) && bookingMatchesListView(row, "checkout", today)).length,
  };
  const rows = viewed
    .filter((row) => matchesTab(row.status, tab))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h1 className="text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">Mặc định booking mới tạo trước. Có thể xem phòng nhận hoặc trả hôm nay.</p>
        </div>
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
          <Link href="/sales/new" className="cta-link">
            Đặt mới
          </Link>
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

      <form className="card p-3 md:flex md:items-end md:gap-3 md:p-4">
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
        {view !== "new" ? <input type="hidden" name="view" value={view} /> : null}
        {tab !== "open" ? <input type="hidden" name="tab" value={tab} /> : null}
        <div className="mt-2 flex gap-2 md:mt-0">
          <Btn type="submit" variant="ghost" className="w-full md:w-auto md:px-6">
            Tìm
          </Btn>
          {q ? (
            <Link
              href={bookingsHref(view, tab, "")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-teal"
            >
              Xóa
            </Link>
          ) : null}
        </div>
      </form>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {VIEWS.map((item) => (
          <TabChip key={item.id} href={bookingsHref(item.id, tab, q)} active={view === item.id}>
            {item.label} · {viewCounts[item.id]}
          </TabChip>
        ))}
      </div>
      <div className="tab-scroller -mx-3 px-3 pb-1">
        {TABS.map((item) => (
          <TabChip key={item.id} href={bookingsHref(view, item.id, q)} active={tab === item.id}>
            {item.label} · {counts[item.id]}
          </TabChip>
        ))}
      </div>
      {view === "checkin" ? (
        <p className="text-xs text-[#5c6665]">Phòng nhận {formatDateLong(today)}. Booking nhiều phòng hiện khi có ít nhất một phòng nhận hôm nay.</p>
      ) : null}
      {view === "checkout" ? (
        <p className="text-xs text-[#5c6665]">Phòng trả {formatDateLong(today)}. Booking nhiều phòng hiện khi có ít nhất một phòng trả hôm nay.</p>
      ) : null}
      {q ? (
        <p className="text-xs text-[#5c6665]">
          {rows.length} kết quả trong tab này · {counts.all} booking khớp “{q}”
        </p>
      ) : null}

      {rows.length ? (
        <>
          <div className="booking-list-cards space-y-2">
            {rows.map((row) => (
              <Link key={row.id} href={`/sales/bookings/${row.id}`} className="block">
                <Card className="min-h-16">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">{row.guestName}</p>
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
                      <Chip tone={STATUS_TONE[row.status]}>{SALE_STATUS_LABEL[row.status]}</Chip>
                      {isOtaDebt(row.source, row.otaPaymentMode) ? (
                        <Chip tone="gold">Công nợ OTA</Chip>
                      ) : isOtaSource(row.source) ? (
                        <Chip tone="ok">Thanh toán tại KS</Chip>
                      ) : row.deposit ? (
                        <Chip tone="ok">Đã cọc {formatVnd(row.deposit)}{paidNote(row) ? ` · ${paidNote(row)}` : ""}</Chip>
                      ) : row.status === "reserved" || row.status === "inhouse" ? (
                        <Chip tone="warn">Chưa cọc</Chip>
                      ) : null}
                      <span className="text-xs text-[#5c6665]">Phải thu {formatVnd(row.total)}</span>
                      <span className="text-xs font-semibold">
                        {isOtaDebt(row.source, row.otaPaymentMode)
                          ? `Công nợ OTA ${formatVnd(row.due)}`
                          : isOtaSource(row.source)
                            ? `Còn khách thanh toán ${formatVnd(row.due)}`
                            : `Còn ${formatVnd(row.due)}`}
                      </span>
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
              <Link key={row.id} href={`/sales/bookings/${row.id}`} className="booking-list-row">
                <div className="min-w-0">
                  <p className="truncate font-bold">{row.guestName}</p>
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
                  <Chip tone={STATUS_TONE[row.status]}>{SALE_STATUS_LABEL[row.status]}</Chip>
                  {isOtaDebt(row.source, row.otaPaymentMode) ? (
                    <Chip tone="gold">Công nợ OTA</Chip>
                  ) : isOtaSource(row.source) ? (
                    <Chip tone="ok">Thanh toán tại KS</Chip>
                  ) : row.deposit ? (
                    <Chip tone="ok">Đã cọc{paidNote(row) ? ` · ${paidNote(row)}` : ""}</Chip>
                  ) : row.status === "reserved" || row.status === "inhouse" ? (
                    <Chip tone="warn">Chưa cọc</Chip>
                  ) : null}
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
            view === "checkin"
              ? "Không có phòng nhận hôm nay trong tab này. Đổi tab hoặc về Mới nhất."
              : view === "checkout"
                ? "Không có phòng trả hôm nay trong tab này. Đổi tab hoặc về Mới nhất."
                : q
                  ? "Đổi từ khóa hoặc tab. Có thể tìm tên (không dấu), SĐT, phòng, mã, ghi chú, nguồn."
                  : "Bấm Đặt mới để tạo booking."
          }
        />
      )}
    </main>
  );
}
