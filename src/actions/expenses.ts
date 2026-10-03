"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { parseExpenseForm } from "@/lib/expenses";
import { can } from "@/lib/permissions";
import * as repo from "@/lib/repos";
import { parseMoney } from "@/lib/sales";

async function requireManager() {
  const user = await requireSession();
  if (!can(user.role, "manageExpenses")) throw new Error("Chỉ quản lý mới nhập chi phí");
  return user;
}

function back(date: string, grain: string, error: string): never {
  const params = new URLSearchParams();
  if (grain) params.set("grain", grain);
  if (date) params.set("date", date);
  params.set("error", error);
  redirect(`/expenses?${params.toString()}`);
}

export async function createExpenseAction(formData: FormData) {
  const user = await requireManager();
  const spentOn = String(formData.get("spentOn") || "");
  const grain = String(formData.get("grain") || "month");
  let draft;
  try {
    const labels = await repo.listExpensePayers();
    draft = parseExpenseForm(
      {
        spentOn,
        category: String(formData.get("category") || ""),
        amount: parseMoney(formData.get("amount")),
        hasInvoice: String(formData.get("hasInvoice") || ""),
        fundedBy: String(formData.get("fundedBy") || ""),
        spentBy: String(formData.get("spentBy") || ""),
        note: String(formData.get("note") || ""),
      },
      labels,
    );
  } catch (error) {
    back(spentOn, grain, (error as Error).message);
  }
  await repo.createExpense(user, draft);
  revalidatePath("/expenses");
  const params = new URLSearchParams({ grain: "month", date: draft.spentOn, ok: "1" });
  redirect(`/expenses?${params.toString()}`);
}

export async function deleteExpenseAction(formData: FormData) {
  const user = await requireManager();
  const id = String(formData.get("id") || "");
  const date = String(formData.get("date") || "");
  const grain = String(formData.get("grain") || "month");
  try {
    await repo.deleteExpense(user, id);
  } catch (error) {
    back(date, grain, (error as Error).message);
  }
  revalidatePath("/expenses");
  const params = new URLSearchParams();
  if (grain) params.set("grain", grain);
  if (date) params.set("date", date);
  redirect(`/expenses?${params.toString()}`);
}
