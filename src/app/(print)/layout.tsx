import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HOTEL_LETTERHEAD } from "@/lib/constants";

export const metadata: Metadata = {
  title: HOTEL_LETTERHEAD,
};

export default async function PrintLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return <div className="min-h-dvh bg-white text-black">{children}</div>;
}
