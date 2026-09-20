import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, TabChip } from "@/components/ui";
import { RegistrationTimer } from "@/components/countdown";
import { getSession } from "@/lib/auth";
import { SALE_ORIGIN_LABEL, SALE_SOURCE_LABEL, STAY_LABEL } from "@/lib/constants";
import { maskName } from "@/lib/mask";
import { listStays } from "@/lib/repos";
import { stayBoardStatus } from "@/lib/stay-checklist";
import { todayVN } from "@/lib/datetime";
import type { SaleOrigin, SaleSource } from "@/lib/types";

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { tab = "inhouse" } = await searchParams;
  const stays = await listStays();
  const today = todayVN();
  const tabs = ["arriving", "inhouse", "departing", "no_show"] as const;
  const rows = stays.filter((s) => stayBoardStatus(s, today) === tab);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Lễ tân</h1>
      <p className="text-xs text-[#5c6665]">Khách từ ezCloud (agent đẩy vào) hoặc lễ tân nhập tay. Vẫn đối chiếu mã PMS khi cần.</p>
      <div className="tab-scroller -mx-3 px-3">
        {tabs.map((t) => (
          <TabChip key={t} href={`/reception?tab=${t}`} active={tab === t}>
            {STAY_LABEL[t]}
          </TabChip>
        ))}
      </div>
      {rows.map((s) => {
        const openRequests = s.requests.filter((r) => r.status === "open");
        return (
          <Link key={s.id} href={`/reception/${s.id}`} className="block">
            <Card className="mb-2 min-h-16">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">{maskName(s.guestName, user.role)}</p>
                  <p className="text-xs text-[#5c6665]">
                    {SALE_SOURCE_LABEL[s.source as SaleSource] || s.source || "—"} · {SALE_ORIGIN_LABEL[(s.origin as SaleOrigin) || "ops"]} · {s.pmsCode} · P.{s.room?.number || "—"}
                  </p>
                </div>
                <Chip>{STAY_LABEL[stayBoardStatus(s, today)]}</Chip>
              </div>
              {s.vehicles.length ? (
                <p className="mt-1 text-xs text-[#5c6665]">Xe {s.vehicles.map((v) => v.plate).join(", ")}</p>
              ) : null}
              {openRequests.length ? (
                <p className="mt-1 text-xs text-[#9a5b00]">
                  {openRequests.length} yêu cầu chưa xong
                  {s.notes ? ` · ${s.notes}` : ""}
                </p>
              ) : s.notes ? (
                <p className="mt-1 text-xs text-[#5c6665]">{s.notes}</p>
              ) : null}
              <div className="mt-2">
                <RegistrationTimer dueAt={s.registrationDueAt} doneAt={s.registrationDoneAt} />
              </div>
            </Card>
          </Link>
        );
      })}
    </main>
  );
}
