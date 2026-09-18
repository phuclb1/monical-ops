import { eq } from "drizzle-orm";
import { bookingKey, formatOpsBookingCode, isLegacyOpsBookingCode, parseOpsBookingCode } from "../sales";
import { nowISO, todayVN } from "../datetime";
import type { AppDb } from "./index";
import * as t from "./schema";

function yearMonthOf(iso: string | null | undefined) {
  const day = todayVN(iso ? new Date(iso) : new Date());
  return { yearMonth: day.slice(0, 7), month: day.slice(5, 7), day };
}

let rekeyed = false;

export async function nextOpsBookingCode(db: AppDb, at = nowISO()) {
  const { yearMonth, month } = yearMonthOf(at);
  const rows = await db.select({
    pmsCode: t.roomSales.pmsCode,
    createdAt: t.roomSales.createdAt,
  }).from(t.roomSales);
  const used = new Set<string>();
  const seqs: number[] = [];
  for (const row of rows) {
    const code = row.pmsCode?.trim();
    if (code) used.add(code);
    const parsed = parseOpsBookingCode(code);
    if (!parsed || String(parsed.month).padStart(2, "0") !== month) continue;
    if (yearMonthOf(row.createdAt).yearMonth !== yearMonth) continue;
    seqs.push(parsed.seq);
  }
  let seq = (seqs.length ? Math.max(...seqs) : 0) + 1;
  let code = formatOpsBookingCode(seq, month);
  while (used.has(code)) {
    seq += 1;
    code = formatOpsBookingCode(seq, month);
  }
  return code;
}

export async function rekeyLegacyOpsBookingCodes(db: AppDb) {
  if (rekeyed) return;
  const sales = await db.select().from(t.roomSales);
  const groups = new Map<string, typeof sales>();
  for (const row of sales) {
    if ((row.origin || "ops") === "ezcloud") continue;
    const key = bookingKey(row);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const used = new Set(
    sales.map((row) => row.pmsCode?.trim()).filter((code): code is string => Boolean(code)),
  );
  const seqByMonth = new Map<string, number>();
  for (const rows of groups.values()) {
    const parsed = parseOpsBookingCode(rows[0]?.pmsCode);
    if (!parsed) continue;
    const { yearMonth, month } = yearMonthOf(rows[0].createdAt);
    if (String(parsed.month).padStart(2, "0") !== month) continue;
    const key = yearMonth;
    seqByMonth.set(key, Math.max(seqByMonth.get(key) || 0, parsed.seq));
  }

  const legacy = [...groups.values()]
    .filter((rows) => isLegacyOpsBookingCode(rows[0]?.pmsCode))
    .sort((a, b) => a[0].createdAt.localeCompare(b[0].createdAt) || a[0].id.localeCompare(b[0].id));

  for (const rows of legacy) {
    const oldCode = rows[0].pmsCode?.trim();
    if (!oldCode) continue;
    const { yearMonth, month } = yearMonthOf(rows[0].createdAt);
    const parsed = parseOpsBookingCode(oldCode);
    let seq =
      parsed && String(parsed.month).padStart(2, "0") === month
        ? parsed.seq
        : (seqByMonth.get(yearMonth) || 0) + 1;
    let code = formatOpsBookingCode(seq, month);
    while (used.has(code)) {
      seq += 1;
      code = formatOpsBookingCode(seq, month);
    }
    seqByMonth.set(yearMonth, seq);
    used.add(code);
    used.delete(oldCode);
    for (const row of rows) {
      await db.update(t.roomSales).set({ pmsCode: code, updatedAt: nowISO() }).where(eq(t.roomSales.id, row.id));
    }
    await db.update(t.stays).set({ pmsCode: code, updatedAt: nowISO() }).where(eq(t.stays.pmsCode, oldCode));
  }
  rekeyed = true;
}
