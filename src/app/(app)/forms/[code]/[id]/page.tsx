import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { getForm, listUsers } from "@/lib/repos";

export default async function FormViewPage({
  params,
}: {
  params: Promise<{ code: string; id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id } = await params;
  const row = await getForm(id);
  if (!row) notFound();
  const users = await listUsers();
  const who = users.find((u) => u.id === row.submittedBy);
  const payload = JSON.parse(row.payload) as Record<string, string>;

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">{row.formCode}</h1>
      <Card>
        <p className="text-sm">Người nộp: {who?.fullName}</p>
        <p className="text-sm">Thời gian: {formatDateTime(row.createdAt)}</p>
        <p className="text-sm">Xác nhận: {row.signature || "—"}</p>
      </Card>
      <Card>
        <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(payload, null, 2)}</pre>
      </Card>
    </main>
  );
}
