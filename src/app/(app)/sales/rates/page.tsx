import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function RoomRatesPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageRates")) redirect("/sales");
  redirect("/rooms/manage");
}
