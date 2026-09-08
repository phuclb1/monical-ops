import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { FORM_CATALOG } from "@/lib/constants";
import { listForms, listUsers } from "@/lib/repos";
import { formatDateTime } from "@/lib/datetime";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; code?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const q = await searchParams;
  const [rows, users] = await Promise.all([listForms({ date: q.date, code: q.code }), listUsers()]);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Biểu mẫu điện tử</h1>
      <form className="grid grid-cols-2 gap-2">
        <input type="date" name="date" defaultValue={q.date} />
        <select name="code" defaultValue={q.code || ""}>
          <option value="">Mọi mẫu</option>
          {FORM_CATALOG.map((f) => (
            <option key={f.code} value={f.code}>
              {f.code}
            </option>
          ))}
        </select>
        <button className="col-span-2 rounded-xl bg-white py-2 text-sm font-semibold">Tìm</button>
      </form>
      {FORM_CATALOG.map((f) => (
        <Link key={f.code} href={`/forms/${f.code}`}>
          <Card className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-bold">{f.code}</p>
              <p className="text-sm">{f.name}</p>
            </div>
            <Chip tone={f.p0 ? "teal" : "neutral"}>{f.p0 ? "P0" : "P1"}</Chip>
          </Card>
        </Link>
      ))}
      <h2 className="pt-2 font-bold">Đã nộp</h2>
      {rows.map((r) => {
        const who = users.find((u) => u.id === r.submittedBy);
        return (
          <Link key={r.id} href={`/forms/${r.formCode}/${r.id}`}>
            <Card className="mb-2">
              <p className="font-semibold">
                {r.formCode} · {who?.fullName}
              </p>
              <p className="text-xs text-[#5c6665]">{formatDateTime(r.createdAt)}</p>
            </Card>
          </Link>
        );
      })}
    </main>
  );
}
