import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, formatDateNumeric } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, isOpsBookingCode, matchesBookingSearch, paidNote } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

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

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { tab: rawTab, q: rawQ } = await searchParams;
  const tab = isTab(rawTab || "") ? rawTab : "open";
  const q = (rawQ || "").trim();
  const bookings = await listBookings();
  const matched = q ? bookings.filter((row) => matchesBookingSearch(row, q)) : bookings;
  const counts = {
    open: matched.filter((row) => row.status === "reserved" || row.status === "inhouse" || row.status === "departed").length,
    reserved: matched.filter((row) => row.status === "reserved").length,
    inhouse: matched.filter((row) => row.status === "inhouse").length,
    done: matched.filter((row) => row.status === "departed" || row.status === "cancelled" || row.status === "no_show").length,
    all: matched.length,
  };
  const rows = matched
    .filter((row) => {
      if (tab === "open" && row.status !== "reserved" && row.status !== "inhouse" && row.status !== "departed") return false;
      if (tab === "reserved" && row.status !== "reserved") return false;
      if (tab === "inhouse" && row.status !== "inhouse") return false;
      if (tab === "done" && row.status !== "departed" && row.status !== "cancelled" && row.status !== "no_show") return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  return (
    <main className="booking-desk space-y-3 px-3 py-4 md:space-y-4">
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h1 className="text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-[#5c6665] md:text-sm">Quản lý booking: khách, nhiều phòng, mã PMS. Sơ đồ phòng nằm ở Bán phòng.</p>
        </div>
        <div className="flex flex-col items-end gap-1 md:flex-row md:items-center md:gap-3">
          <Link href="/sales/new" className="cta-link">
            Đặt mới
          </Link>
          <Link href="/sales" className="flex min-h-11 items-center text-sm font-semibold text-teal">
            Sơ đồ phòng
          </Link>
          {can(user.role, "viewSalesRevenue") ? (
            <Link href="/reports/sales" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Doanh thu
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
        {tab !== "open" ? <input type="hidden" name="tab" value={tab} /> : null}
        <div className="mt-2 flex gap-2 md:mt-0">
          <Btn type="submit" variant="ghost" className="w-full md:w-auto md:px-6">
            Tìm
          </Btn>
          {q ? (
            <Link
              href={tab === "open" ? "/sales/bookings" : `/sales/bookings?tab=${tab}`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold text-teal"
            >
              Xóa
            </Link>
          ) : null}
        </div>
      </form>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {TABS.map((item) => (
          <TabChip key={item.id} href={item.id === "open" && !q ? "/sales/bookings" : `/sales/bookings?tab=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} active={tab === item.id}>
            {item.label} · {counts[item.id]}
          </TabChip>
        ))}
      </div>
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
                      {row.pmsCode ? (
                        <p className="mt-1 text-xs text-[#5c6665]">
                          {isOpsBookingCode(row.pmsCode) ? "Mã Ops" : "PMS"} {row.pmsCode}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Chip tone={STATUS_TONE[row.status]}>{SALE_STATUS_LABEL[row.status]}</Chip>
                      {row.deposit ? (
                        <Chip tone="ok">Đã cọc {formatVnd(row.deposit)}{paidNote(row) ? ` · ${paidNote(row)}` : ""}</Chip>
                      ) : row.status === "reserved" || row.status === "inhouse" ? (
                        <Chip tone="warn">Chưa cọc</Chip>
                      ) : null}
                      <span className="text-xs text-[#5c6665]">Phải thu {formatVnd(row.total)}</span>
                      <span className="text-xs font-semibold">Còn {formatVnd(row.due)}</span>
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
              <span>Ngày</span>
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
                <p className="text-sm">{SALE_SOURCE_LABEL[row.source as SaleSource] || row.source}</p>
                <div className="flex flex-col items-start gap-1">
                  <Chip tone={STATUS_TONE[row.status]}>{SALE_STATUS_LABEL[row.status]}</Chip>
                  {row.deposit ? (
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
          text={q ? "Đổi từ khóa hoặc tab. Có thể tìm tên (không dấu), SĐT, phòng, mã, ghi chú, nguồn." : "Bấm Đặt mới để tạo booking."}
        />
      )}
    </main>
  );
}
