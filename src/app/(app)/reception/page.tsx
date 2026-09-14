import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { RegistrationTimer } from "@/components/countdown";
import { getSession } from "@/lib/auth";
import { STAY_LABEL } from "@/lib/constants";
import { maskName } from "@/lib/mask";
import { listStays } from "@/lib/repos";
import type { StayStatus } from "@/lib/types";

export default async function ReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { tab = "inhouse" } = await searchParams;
  const stays = await listStays();
  const tabs = ["arriving", "inhouse", "departing", "no_show"] as const;
  const rows = stays.filter((s) => s.status === tab);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Lễ tân</h1>
      <p className="text-xs text-[#5c6665]">Danh sách tham chiếu PMS — xác nhận đã nhập trên ezCloudhotel.</p>
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/reception?tab=${t}`}
            className={`rounded-full px-3 py-1 text-xs font-bold ${tab === t ? "bg-teal text-white" : "bg-white"}`}
          >
            {STAY_LABEL[t]}
          </Link>
        ))}
      </div>
      {rows.map((s) => {
        const openRequests = s.requests.filter((r) => r.status === "open");
        return (
          <Link key={s.id} href={`/reception/${s.id}`}>
            <Card className="mb-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">{maskName(s.guestName, user.role)}</p>
                  <p className="text-xs text-[#5c6665]">
                    {s.pmsCode} · P.{s.room?.number || "—"}
                  </p>
                </div>
                <Chip>{STAY_LABEL[s.status as StayStatus]}</Chip>
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
