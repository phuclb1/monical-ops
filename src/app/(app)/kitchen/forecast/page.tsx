import { redirect } from "next/navigation";
import { KitchenForecast } from "@/components/kitchen-forecast";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function KitchenForecastPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "viewKitchen")) redirect("/more");

  return (
    <main className="space-y-3 px-3 py-4">
      <KitchenForecast user={user} />
    </main>
  );
}
