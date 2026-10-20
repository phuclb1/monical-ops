/**
 * Dump production D1 → local SQLite → chạy patch + backfill sổ cái → đối soát.
 * Không ghi D1 remote. Không đụng data/ops.db.
 *
 *   npm run qa:tx-dryrun
 *   SKIP_DUMP=1 npm run qa:tx-dryrun   # dùng lại tmp/ops-prod.sql
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { SCHEMA_PATCHES } from "../src/db/migrate";
import { backfillBookingTransactions, BOOKING_TX_BACKFILL_FLAG } from "../src/db/backfill-booking-txs";
import type { AppDb } from "../src/db";
import * as t from "../src/db/schema";
import { bookingKey, isOtaDebt, projectBookingPaid } from "../src/lib/sales";

const root = process.cwd();
const dumpSql = join(root, "tmp", "ops-prod.sql");
const localDb = join(root, "tmp", "prd-ledger-dryrun.db");
const dbName = process.env.D1_NAME || "ops-monical";

type SaleSnap = {
  id: string;
  bookingId: string | null;
  guestName: string;
  source: string;
  otaPaymentMode: string | null;
  status: string;
  deposit: number;
  checkinPaid: number;
  cashPaid: number;
  transferPaid: number;
  companyPaid: number;
  refundCash: number;
  refundTransfer: number;
  refundCompany: number;
  createdAt: string;
};

function run(args: string[], opts: { inherit?: boolean } = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    cwd: root,
    stdio: opts.inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    const err = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
    throw new Error(`${args.join(" ")} failed (${result.status}): ${err.slice(-800)}`);
  }
  return result.stdout || "";
}

function money(value: number) {
  return value.toLocaleString("vi-VN");
}

function refundParts(row: SaleSnap) {
  return row.refundCash + row.refundTransfer + row.refundCompany;
}

function dumpProd() {
  mkdirSync(join(root, "tmp"), { recursive: true });
  if (process.env.SKIP_DUMP === "1" && existsSync(dumpSql)) {
    console.log(`Dùng dump có sẵn ${dumpSql}`);
    return;
  }
  console.log(`Dump ${dbName} --remote → ${dumpSql}`);
  run(["npx", "wrangler", "d1", "export", dbName, "--remote", "--output", dumpSql, "--skip-confirmation"], { inherit: true });
}

function openLocalFromDump(): AppDb {
  if (!existsSync(dumpSql)) throw new Error(`Thiếu ${dumpSql}`);
  if (existsSync(localDb)) unlinkSync(localDb);
  const sqlite = spawnSync("sqlite3", [localDb], {
    encoding: "utf8",
    input: `.read ${dumpSql}\n`,
  });
  if (sqlite.status !== 0) {
    throw new Error(`sqlite3 import failed: ${(sqlite.stderr || sqlite.stdout || "").slice(-800)}`);
  }
  return drizzle(createClient({ url: `file:${localDb}` }), { schema: t }) as unknown as AppDb;
}

async function applyPatches(db: AppDb) {
  for (const stmt of SCHEMA_PATCHES) {
    try {
      await db.run(stmt);
    } catch {
      // already on dump
    }
  }
}

function headOf(rooms: SaleSnap[]) {
  return [...rooms].sort((a, b) => b.deposit - a.deposit || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
}

function printRollback() {
  console.log("\nRollback PRD (chỉ khi cache room_sales chưa bị syncBookingMoney ghi đè):");
  console.log(`  npx wrangler d1 execute ${dbName} --remote --command "DELETE FROM booking_transactions;"`);
  console.log(`  npx wrangler d1 execute ${dbName} --remote --command "DELETE FROM app_settings WHERE key = '${BOOKING_TX_BACKFILL_FLAG}';"`);
  console.log("  npx wrangler rollback ops-monical --yes");
}

async function main() {
  dumpProd();
  const db = openLocalFromDump();
  const beforeSales = (await db.select().from(t.roomSales)).map((row): SaleSnap => ({
    id: row.id,
    bookingId: row.bookingId,
    guestName: row.guestName,
    source: row.source,
    otaPaymentMode: row.otaPaymentMode,
    status: row.status,
    deposit: row.deposit || 0,
    checkinPaid: row.checkinPaid || 0,
    cashPaid: row.cashPaid || 0,
    transferPaid: row.transferPaid || 0,
    companyPaid: row.companyPaid || 0,
    refundCash: row.refundCash || 0,
    refundTransfer: row.refundTransfer || 0,
    refundCompany: row.refundCompany || 0,
    createdAt: row.createdAt,
  }));
  const beforeById = new Map(beforeSales.map((row) => [row.id, row]));

  console.log(`Local DB ${localDb}`);
  console.log(`Trước migrate: ${beforeSales.length} room_sales`);
  await applyPatches(db);
  await backfillBookingTransactions(db);

  const afterSales = await db.select().from(t.roomSales);
  const txs = await db.select().from(t.bookingTransactions);
  const flag = (await db.select().from(t.appSettings)).find((row) => row.key === BOOKING_TX_BACKFILL_FLAG);

  const cacheMutated = afterSales.filter((row) => {
    const before = beforeById.get(row.id);
    if (!before) return true;
    return before.deposit !== (row.deposit || 0)
      || before.checkinPaid !== (row.checkinPaid || 0)
      || before.cashPaid !== (row.cashPaid || 0)
      || before.transferPaid !== (row.transferPaid || 0)
      || before.companyPaid !== (row.companyPaid || 0)
      || before.refundCash !== (row.refundCash || 0)
      || before.refundTransfer !== (row.refundTransfer || 0)
      || before.refundCompany !== (row.refundCompany || 0);
  });

  const groups = new Map<string, SaleSnap[]>();
  for (const row of beforeSales) {
    const key = bookingKey(row);
    if (!key || key.startsWith("seq-hold-")) continue;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  const txByBooking = new Map<string, typeof txs>();
  for (const tx of txs) {
    const list = txByBooking.get(tx.bookingId) || [];
    list.push(tx);
    txByBooking.set(tx.bookingId, list);
  }

  type Verdict = "match" | "ota-unpaid" | "mismatch";
  const rows = [...groups.entries()].map(([bid, rooms]) => {
    const head = headOf(rooms);
    const planned = txByBooking.get(bid) || [];
    const paid = projectBookingPaid(planned);
    const otaUnpaid = isOtaDebt(head.source, head.otaPaymentMode) && head.deposit === 0 && planned.length === 0;
    const verdict: Verdict = otaUnpaid
      ? "ota-unpaid"
      : head.deposit === paid.deposit && refundParts(head) === paid.refundTotal
        ? "match"
        : "mismatch";
    const methodSum = head.cashPaid + head.transferPaid + head.companyPaid;
    return {
      bid,
      guest: head.guestName,
      source: head.source,
      status: head.status,
      rooms: rooms.length,
      cache: head.deposit,
      after: paid.deposit,
      refundCache: refundParts(head),
      refundAfter: paid.refundTotal,
      txN: planned.length,
      kinds: planned.map((tx) => `${tx.kind}:${tx.amount}`).join(", ") || "—",
      dirtyMethods: methodSum > 0 && methodSum !== head.deposit,
      verdict,
    };
  });

  const counts = { match: 0, "ota-unpaid": 0, mismatch: 0 };
  for (const row of rows) counts[row.verdict] += 1;
  const mismatches = rows.filter((row) => row.verdict === "mismatch");
  const dirty = rows.filter((row) => row.dirtyMethods);

  console.log(`Sau migrate: ${txs.length} txs · flag ${flag?.value || "missing"}`);
  console.log(`Booking ${rows.length} · khớp ${counts.match} · OTA chưa nhận ${counts["ota-unpaid"]} · lệch ${counts.mismatch}`);
  console.log(`Cache room_sales ${cacheMutated.length ? `BỊ ĐỔI ${cacheMutated.length} dòng` : "không đổi"}`);

  if (dirty.length) {
    console.log(`\n${dirty.length} booking method-split ≠ deposit (backfill lấy cột deposit):`);
    for (const row of dirty.slice(0, 20)) {
      console.log(`  ${row.guest}  cache ${money(row.cache)}  ${row.kinds}`);
    }
    if (dirty.length > 20) console.log(`  … +${dirty.length - 20}`);
  }

  if (mismatches.length) {
    console.log("\nLệch inflow / hoàn — không deploy:");
    for (const row of mismatches) {
      console.log(`  ${row.guest}  ${row.bid}`);
      console.log(`    cache ${money(row.cache)} → sổ cái ${money(row.after)} · hoàn ${money(row.refundCache)} → ${money(row.refundAfter)} · ${row.kinds}`);
    }
  }

  const ota = rows.filter((row) => row.verdict === "ota-unpaid");
  if (ota.length) {
    console.log(`\nOTA công nợ chưa nhận (${ota.length}, cố ý 0 tx):`);
    for (const row of ota.slice(0, 15)) {
      console.log(`  ${row.guest}  ${row.status}  ${row.bid}`);
    }
    if (ota.length > 15) console.log(`  … +${ota.length - 15}`);
  }

  printRollback();

  if (cacheMutated.length || mismatches.length) {
    console.error(`\nGATE FAIL · lệch ${mismatches.length} · cache đổi ${cacheMutated.length}. Không deploy.`);
    process.exit(1);
  }
  console.log("\nGATE PASS · dump PRD + migrate local khớp. Chưa deploy production.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
