import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn, Card, Chip, Empty, Field, Stat, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, SALE_SOURCE_GROUPS, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateLong, nextDate, prevDate, todayVN } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { salesBoard } from "@/lib/repos";
import { formatVnd, isSaleOrigin, isSaleSource } from "@/lib/sales";
import type { SaleOrigin, SaleSource, SaleStatus } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  vacant: "Trống",
  reserved: "Đã giữ",
  inhouse: "Đang ở",
  ooo: "OOO",
};

const TILE: Record<string, string> = {
  vacant: "border-line bg-white",
  reserved: "border-[#e8c9a0] bg-[#fff8ea]",
  inhouse: "border-[#c9e6e4] bg-[#e8f3f2]",
  ooo: "border-[#f1c7c7] bg-[#fde8e8]",
};

const PLATFORM_CHIP: Record<SaleSource, string> = {
  walk_in: "Vãng lai",
  phone: "Điện thoại",
  company: "Công ty",
  ezcloud: "Web KS",
  booking: "Booking",
  agoda: "Agoda",
  traveloka: "Traveloka",
  expedia: "Expedia",
  airbnb: "Airbnb",
  ota: "OTA",
};

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <TabChip href={href} active={active}>
      {children}
    </TabChip>
  );
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; origin?: string; platform?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSales")) redirect("/more");
  const { date: rawDate, error, origin: rawOrigin, platform: rawPlatform } = await searchParams;
  const today = todayVN();
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const origin = isSaleOrigin(rawOrigin || "") ? rawOrigin : "";
  const platform = isSaleSource(rawPlatform || "") ? rawPlatform : "";
  const board = await salesBoard(date);
  const floors = [...new Set(board.cells.map((cell) => cell.room.floor))].sort((a, b) => a - b);
  const nightSales = board.nightSales.filter((sale) => (!origin || sale.origin === origin) && (!platform || sale.source === platform));
  const upcoming = board.upcoming.filter((sale) => (!origin || sale.origin === origin) && (!platform || sale.source === platform));
  const salesHref = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    next.set("date", extra.date ?? date);
    const nextOrigin = extra.origin === "" ? "" : extra.origin ?? origin;
    const nextPlatform = extra.platform === "" ? "" : extra.platform ?? platform;
    if (nextOrigin) next.set("origin", nextOrigin);
    if (nextPlatform) next.set("platform", nextPlatform);
    return `/sales?${next.toString()}`;
  };

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Bán phòng</h1>
          <p className="text-xs text-[#5c6665]">Tạo tay trên Ops hoặc nhận từ agent ezCloud. Lọc theo nền tảng.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/sales/new?date=${date}`} className="cta-link">
            Bán phòng
          </Link>
          {can(user.role, "manageRates") ? (
            <Link href="/sales/rates" className="flex min-h-11 items-center text-sm font-semibold text-teal">
              Giá phòng
            </Link>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <Card>
        <form className="space-y-3">
          <div className="flex items-end gap-2">
            <Link href={salesHref({ date: prevDate(date) })} className="hit-btn" aria-label="Ngày trước">
              ←
            </Link>
            <div className="min-w-0 flex-1">
              <Field label="Ngày sơ đồ">
                <input type="date" name="date" defaultValue={date} />
              </Field>
            </div>
            <Link href={salesHref({ date: nextDate(date) })} className="hit-btn" aria-label="Ngày sau">
              →
            </Link>
          </div>
          {origin ? <input type="hidden" name="origin" value={origin} /> : null}
          {platform ? <input type="hidden" name="platform" value={platform} /> : null}
          <Btn type="submit" variant="ghost" className="w-full">
            Xem
          </Btn>
        </form>
        <p className="mt-2 text-xs font-semibold text-[#5c6665]">{formatDateLong(date)}</p>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Trống" value={board.vacant} tone="text-[#1b7a4e]" />
        <Stat label="Đã bán" value={board.sold} />
        <Stat label="Đang ở" value={board.inhouse} tone="text-teal" />
        <Stat label="OOO" value={board.ooo} tone="text-[#c23b3b]" />
        <Stat label="Doanh thu đêm" value={formatVnd(board.revenue)} />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
        {Object.entries(KIND_LABEL).map(([key, label]) => (
          <span key={key} className={`rounded-full border px-2 py-1 ${TILE[key]}`}>
            {label}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <div className="tab-scroller -mx-3 px-3">
          <div className="flex w-max gap-2">
            <FilterChip href={salesHref({ origin: "" })} active={!origin}>
              Tất cả
            </FilterChip>
            <FilterChip href={salesHref({ origin: "ops" })} active={origin === "ops"}>
              Ops
            </FilterChip>
            <FilterChip href={salesHref({ origin: "ezcloud" })} active={origin === "ezcloud"}>
              ezCloud
            </FilterChip>
          </div>
        </div>
        <div className="tab-scroller -mx-3 px-3">
          <div className="flex w-max gap-2">
            <FilterChip href={salesHref({ platform: "" })} active={!platform}>
              Tất cả
            </FilterChip>
            {SALE_SOURCE_GROUPS.flatMap((group) => group.values).map((value) => (
              <FilterChip key={value} href={salesHref({ platform: value })} active={platform === value}>
                {PLATFORM_CHIP[value]}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      {floors.map((floor) => (
        <section key={floor} className="space-y-2">
          <h2 className="text-sm font-bold text-[#5c6665]">Tầng {floor}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
            {board.cells
              .filter((cell) => cell.room.floor === floor)
              .map((cell) => {
                const href = cell.sale ? `/sales/${cell.sale.id}` : cell.kind === "ooo" ? `/rooms/${cell.room.id}` : `/sales/new?room=${cell.room.id}&date=${date}`;
                return (
                  <Link key={cell.room.id} href={href} className={`flex min-h-[5.75rem] flex-col justify-between rounded-2xl border px-3 py-3 ${TILE[cell.kind]}`}>
                    <p className="text-base font-bold">P.{cell.room.number}</p>
                    <p className="truncate text-xs text-[#5c6665]">{cell.room.type}</p>
                    <p className="truncate text-xs font-semibold">
                      {cell.sale ? cell.sale.guestName : cell.kind === "ooo" ? "Ngừng bán" : "Trống — bán"}
                    </p>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}

      <Card>
        <h2 className="mb-2 font-bold">Đêm {formatDateLong(date)}</h2>
        {nightSales.length ? (
          <div className="space-y-2">
            {nightSales.map((sale) => (
              <Link key={sale.id} href={`/sales/${sale.id}`} className="flex min-h-16 items-center justify-between gap-2 rounded-xl bg-sand px-3.5 py-3">
                <div>
                  <p className="font-semibold">
                    P.{sale.room?.number} · {sale.guestName}
                  </p>
                  <p className="text-xs text-[#5c6665]">
                    {SALE_SOURCE_LABEL[sale.source as SaleSource] || sale.source} · {SALE_ORIGIN_LABEL[(sale.origin as SaleOrigin) || "ops"]} · {sale.checkIn} → {sale.checkOut} · {formatVnd(sale.rate)}/đêm
                    {sale.discountValue ? " · CK" : ""}
                  </p>
                </div>
                <Chip tone={sale.status === "inhouse" ? "ok" : "gold"}>{SALE_STATUS_LABEL[sale.status as SaleStatus]}</Chip>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title={board.nightSales.length ? "Không khớp bộ lọc" : "Chưa bán đêm này"} text={board.nightSales.length ? "Bỏ lọc nguồn / nền tảng để xem hết chỗ bán." : "Bấm phòng trống trên sơ đồ để bán."} />
        )}
      </Card>

      {upcoming.length ? (
        <Card>
          <h2 className="mb-2 font-bold">Giữ chỗ 14 ngày tới</h2>
          <div className="space-y-2">
            {upcoming.map((sale) => (
              <Link key={sale.id} href={`/sales/${sale.id}`} className="block min-h-12 py-2 text-sm">
                {sale.checkIn} · P.{sale.room?.number} · {sale.guestName} · {SALE_SOURCE_LABEL[sale.source as SaleSource] || sale.source}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
