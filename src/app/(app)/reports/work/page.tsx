import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportTabs } from "@/components/report-tabs";
import { Card, Chip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { listForms, overdueReport } from "@/lib/repos";

export default async function WorkReportPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewReports")) redirect("/more");
  const [overdue, forms] = await Promise.all([overdueReport(), listForms({ date: undefined })]);

  return (
    <main className="space-y-3 px-3 py-4">
      <h1 className="text-xl font-bold">Báo cáo công việc chung</h1>
      <p className="text-xs text-[#5c6665]">Việc quá hạn, đăng ký trễ, checkout thiếu thông tin và biểu mẫu gần đây.</p>

      <ReportTabs active="work" showSales={can(user.role, "viewSalesRevenue")} showWork />

      <Card>
        <h2 className="mb-2 font-bold">Việc quá hạn ({overdue.tasks.length})</h2>
        {overdue.tasks.map((task) => (
          <Link key={task.id} href={`/tasks/${task.id}`} className="mb-2 block text-sm">
            {task.content} <Chip tone="danger">Trễ</Chip>
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Đăng ký lưu trú quá hạn ({overdue.registrations.length})</h2>
        {overdue.registrations.map((stay) => (
          <Link key={stay.id} href={`/reception/${stay.id}`} className="mb-2 block text-sm">
            {stay.guestName} · {stay.pmsCode}
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Checkout thiếu PMS / hóa đơn ({overdue.checkouts.length})</h2>
        {overdue.checkouts.map((stay) => (
          <Link key={stay.id} href={`/reception/${stay.id}`} className="mb-2 block text-sm">
            P.{stay.room?.number} {stay.guestName}
          </Link>
        ))}
      </Card>
      <Card>
        <h2 className="mb-2 font-bold">Biểu mẫu gần đây</h2>
        {forms.slice(0, 8).map((form) => (
          <Link key={form.id} href={`/forms/${form.formCode}/${form.id}`} className="block text-sm">
            {form.formCode} · {formatDateTime(form.createdAt)}
          </Link>
        ))}
      </Card>
    </main>
  );
}
