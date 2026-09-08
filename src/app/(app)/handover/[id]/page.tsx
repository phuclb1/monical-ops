import { notFound, redirect } from "next/navigation";
import { acceptHandoverAction } from "@/actions/ops";
import { Btn, Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { listHandovers } from "@/lib/repos";

export default async function HandoverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;
  const ho = (await listHandovers()).find((h) => h.id === id);
  if (!ho) notFound();
  const cats = Object.entries(
    ho.items.reduce<Record<string, typeof ho.items>>((acc, item) => {
      acc[item.category] = acc[item.category] || [];
      acc[item.category].push(item);
      return acc;
    }, {}),
  );

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">BM-01 Bàn giao ca</h1>
      <Chip tone={ho.acceptedBy ? "ok" : "warn"}>{ho.acceptedBy ? "Đã nhận" : "Chờ nhận"}</Chip>
      <Card>
        <p className="text-sm">Người giao: {ho.creator?.fullName} · {formatDateTime(ho.createdAt)}</p>
        <p className="text-sm">Người nhận: {ho.acceptor?.fullName || "—"} · {formatDateTime(ho.acceptedAt)}</p>
        {ho.notes ? <p className="mt-2 text-sm">{ho.notes}</p> : null}
      </Card>
      {cats.map(([cat, items]) => (
        <Card key={cat}>
          <h2 className="mb-2 font-bold">{cat}</h2>
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.id}>{item.summary}</li>
            ))}
          </ul>
        </Card>
      ))}
      {!ho.acceptedBy ? (
        <form action={acceptHandoverAction}>
          <input type="hidden" name="id" value={ho.id} />
          <Btn type="submit" className="w-full">
            Đã nhận bàn giao
          </Btn>
        </form>
      ) : null}
    </main>
  );
}
