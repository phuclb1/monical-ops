import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { sepayClaimDecision, type SepayTransaction } from "@/lib/sepay";

export async function beginSepayNotice(tx: SepayTransaction, now = Date.now()) {
  const db = await getDb();
  const receivedAt = new Date(now).toISOString();
  try {
    await db.insert(t.sepayTransactions).values({
      id: tx.id,
      gateway: tx.gateway,
      accountNumber: tx.accountNumber,
      subAccount: tx.subAccount,
      code: tx.code,
      content: tx.content,
      description: tx.description,
      transferType: tx.transferType,
      transferAmount: tx.transferAmount,
      accumulated: tx.accumulated,
      referenceCode: tx.referenceCode,
      transactionDate: tx.transactionDate,
      notified: false,
      receivedAt,
    });
    return "new" as const;
  } catch {
    const row = (
      await db.select().from(t.sepayTransactions).where(eq(t.sepayTransactions.id, tx.id)).limit(1)
    )[0];
    if (!row) throw new Error("Không ghi được giao dịch SePay");
    const decision = sepayClaimDecision({ notified: Boolean(row.notified), receivedAt: row.receivedAt }, now);
    if (decision === "retry") {
      await db.update(t.sepayTransactions).set({ receivedAt }).where(eq(t.sepayTransactions.id, tx.id));
    }
    return decision === "new" ? ("retry" as const) : decision;
  }
}

export async function markSepayNotified(id: string) {
  const db = await getDb();
  await db.update(t.sepayTransactions).set({ notified: true }).where(eq(t.sepayTransactions.id, id));
}

export async function sepaySecrets() {
  const fromProcess = {
    secret: process.env.SEPAY_WEBHOOK_SECRET?.trim() || "",
    apiKey: process.env.SEPAY_API_KEY?.trim() || "",
  };
  if (fromProcess.secret || fromProcess.apiKey) return fromProcess;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const bag = env as { SEPAY_WEBHOOK_SECRET?: string; SEPAY_API_KEY?: string } | undefined;
    return {
      secret: bag?.SEPAY_WEBHOOK_SECRET?.trim() || "",
      apiKey: bag?.SEPAY_API_KEY?.trim() || "",
    };
  } catch {
    return fromProcess;
  }
}
