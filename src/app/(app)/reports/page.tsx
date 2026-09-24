import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function ReportsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const sales = can(user.role, "viewSalesRevenue");
  const work = can(user.role, "viewReports");
  if (!sales && !work) redirect("/more");
  redirect(sales ? "/reports/sales" : "/reports/work");
}
