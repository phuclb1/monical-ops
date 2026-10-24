import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function ReportsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewReports") && !can(user.role, "viewSalesRevenue")) redirect("/more");
  redirect("/reports/sales");
}
