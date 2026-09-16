import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listBookings } from "@/lib/repos";
import { formatVnd, isOpsBookingCode } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const TABS = [
  { id: "open", label: "Đang mở" },
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
  const q = (rawQ || "").trim().toLowerCase();
  const bookings = await listBookings();
  const counts = {
    open: bookings.filter((row) => row.status === "reserved" || row.status === "inhouse").length,
    reserved: bookings.filter((row) => row.status === "reserved").length,
    inhouse: bookings.filter((row) => row.status === "inhouse").length,
    done: bookings.filter((row) => row.status === "departed" || row.status === "cancelled" || row.status === "no_show").length,
    all: bookings.length,
  };
  const rows = bookings.filter((row) => {
    if (tab === "open" && row.status !== "reserved" && row.status !== "inhouse") return false;
    if (tab === "reserved" && row.status !== "reserved") return false;
    if (tab === "inhouse" && row.status !== "inhouse") return false;
    if (tab === "done" && row.status !== "departed" && row.status !== "cancelled" && row.status !== "no_show") return false;
    if (q && !`${row.guestName} ${row.pmsCode || ""} ${row.roomLabel}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-[#5c6665]">Quản lý booking: khách, nhiều phòng, mã PMS. Sơ đồ phòng nằm ở Bán phòng.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href="/sales/new" className="cta-link">
            Đặt mới
          </Link>
          <Link href="/sales" className="flex min-h-11 items-center text-sm font-semibold text-teal">
            Sơ đồ phòng
          </Link>
        </div>
      </div>

      <form className="card p-3">
        <Field label="Tìm khách / phòng / mã">
          <input name="q" defaultValue={rawQ || ""} placeholder="Tên khách, P.101, OPS-…" />
        </Field>
        {tab !== "open" ? <input type="hidden" name="tab" value={tab} /> : null}
        <Btn type="submit" variant="ghost" className="mt-2 w-full">
          Tìm
        </Btn>
      </form>

      <div className="tab-scroller -mx-3 px-3 pb-1">
        {TABS.map((item) => (
          <TabChip key={item.id} href={item.id === "open" && !q ? "/sales/bookings" : `/sales/bookings?tab=${item.id}${q ? `&q=${encodeURIComponent(rawQ || "")}` : ""}`} active={tab === item.id}>
            {item.label} · {counts[item.id]}
          </TabChip>
        ))}
      </div>

      {rows.length ? (
        rows.map((row) => (
          <Link key={row.id} href={`/sales/bookings/${row.id}`} className="block">
            <Card className="mb-2 min-h-16">
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
                    <Chip tone="ok">Đã cọc {formatVnd(row.deposit)}</Chip>
                  ) : row.status === "reserved" || row.status === "inhouse" ? (
                    <Chip tone="warn">Chưa cọc</Chip>
                  ) : null}
                  <span className="text-xs text-[#5c6665]">Phải thu {formatVnd(row.total)}</span>
                  <span className="text-xs font-semibold">Còn {formatVnd(row.due)}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))
      ) : (
        <Empty title="Không có booking khớp" text={q ? "Đổi từ khóa hoặc tab." : "Bấm Đặt mới để tạo booking."} />
      )}
    </main>
  );
}
