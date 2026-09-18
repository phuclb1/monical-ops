import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listForms, overdueReport } from "@/lib/repos";

export default async function ReportsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [overdue, forms] = await Promise.all([overdueReport(), listForms({ date: undefined })]);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Báo cáo ngày</h1>
      <p className="text-xs text-[#5c6665]">Quản lý xem việc quá hạn, đăng ký trễ và checkout thiếu hóa đơn.</p>
      {can(user.role, "viewSalesRevenue") ? (
        <Link href="/reports/sales" className="card mb-0 flex min-h-16 items-center p-4 font-semibold">
          Doanh thu bán phòng — tháng / quý / năm
        </Link>
      ) : null}

      <Card>
        <h2 className="mb-2 font-bold">Việc quá hạn ({overdue.tasks.length})</h2>
        {overdue.tasks.map((t) => (
          <Link key={t.id} href={`/tasks/${t.id}`} className="mb-2 block text-sm">
            {t.content} <Chip tone="danger">Trễ</Chip>
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Đăng ký lưu trú quá hạn ({overdue.registrations.length})</h2>
        {overdue.registrations.map((s) => (
          <Link key={s.id} href={`/reception/${s.id}`} className="mb-2 block text-sm">
            {s.guestName} · {s.pmsCode}
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Checkout thiếu PMS / hóa đơn ({overdue.checkouts.length})</h2>
        {overdue.checkouts.map((s) => (
          <Link key={s.id} href={`/reception/${s.id}`} className="mb-2 block text-sm">
            P.{s.room?.number} {s.guestName}
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Biểu mẫu gần đây</h2>
        {forms.slice(0, 8).map((f) => (
          <Link key={f.id} href={`/forms/${f.formCode}/${f.id}`} className="block text-sm">
            {f.formCode} · {formatDateTime(f.createdAt)}
          </Link>
        ))}
      </Card>
    </main>
  );
}
