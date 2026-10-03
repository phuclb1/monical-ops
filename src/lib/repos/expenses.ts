import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "../datetime";
import type { ExpenseDraft } from "../expenses";
import type { SessionUser } from "../types";
import { audit } from "./audit";

export async function listExpensePayers() {
  const db = await getDb();
  const rows = await db.select({ spentBy: t.expenses.spentBy }).from(t.expenses);
  return [...new Set(rows.map((row) => row.spentBy.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
}

export async function listExpenses(from: string, to: string) {
  const db = await getDb();
  return db
    .select()
    .from(t.expenses)
    .where(and(gte(t.expenses.spentOn, from), lt(t.expenses.spentOn, to)))
    .orderBy(desc(t.expenses.spentOn), desc(t.expenses.createdAt));
}

export async function createExpense(user: SessionUser, data: ExpenseDraft) {
  const db = await getDb();
  const id = nid();
  const now = nowISO();
  const row = {
    id,
    spentOn: data.spentOn,
    category: data.category,
    amount: data.amount,
    hasInvoice: data.hasInvoice,
    fundedBy: data.fundedBy,
    spentBy: data.spentBy,
    note: data.note,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(t.expenses).values(row);
  await audit(user.id, "expense", id, "create", null, row);
  return id;
}

export async function deleteExpense(user: SessionUser, id: string) {
  const db = await getDb();
  const [before] = await db.select().from(t.expenses).where(eq(t.expenses.id, id));
  if (!before) throw new Error("Không tìm thấy khoản chi");
  await db.delete(t.expenses).where(eq(t.expenses.id, id));
  await audit(user.id, "expense", id, "delete", before, null);
}
