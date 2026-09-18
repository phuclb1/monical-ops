import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homePath } from "@/lib/nav";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homePath(session.role) : "/login");
}
