/**
 * Import booking 00 — Phương Tâm / Standard Plus — lên Ops.
 *
 * Quote (theo tin khách): 14/9 → 18/9, 700k × 4 đêm × 80% = 2.240k (gồm VAT).
 * Text nói "3 đêm" nhưng ngày và phép tính đều là 4 đêm khách sạn (14, 15, 16, 17).
 *
 *   npx tsx scripts/import-booking-00.ts --remote
 *   npx tsx scripts/import-booking-00.ts --remote --apply
 *   npx tsx scripts/import-booking-00.ts --remote --apply --room=104
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bookingQuote, formatOpsBookingCode, parseOpsBookingCode } from "../src/lib/sales";

const BOOKING = {
  id: "sale-00-phuong-tam",
  stayId: "s-00-phuong-tam",
  auditId: "audit-sale-00-phuong-tam",
  guestName: "Phương Tâm",
  checkIn: "2026-09-14",
  checkOut: "2026-09-18",
  rate: 700_000,
  discountKind: "percent" as const,
  discountValue: 20,
  companyPaid: 840_000,
  transferPaid: 840_000 + 560_000,
  source: "company",
  origin: "ops",
  status: "departed",
  adults: 2,
  children: 0,
  breakfast: 1,
  pmsCode: "BK-09-00",
  notes:
    "Standard Plus (STANDARD VIEW) trọn gói 14/9–18/9 · 700k×4×80%=2.240k (gồm VAT) · cọc CT 840k · CK CN 840k+560k",
};

const quote = bookingQuote([
  {
    rate: BOOKING.rate,
    checkIn: BOOKING.checkIn,
    checkOut: BOOKING.checkOut,
    discountKind: BOOKING.discountKind,
    discountValue: BOOKING.discountValue,
  },
]);
const deposit = BOOKING.companyPaid + BOOKING.transferPaid;

function argValue(flag: string) {
  const hit = process.argv.find((item) => item === flag || item.startsWith(`${flag}=`));
  if (!hit) return "";
  if (hit.includes("=")) return hit.slice(flag.length + 1).trim();
  const index = process.argv.indexOf(hit);
  return process.argv[index + 1] && !process.argv[index + 1].startsWith("-") ? process.argv[index + 1].trim() : "";
}

function sqlLiteral(value: string | number | null) {
  if (value == null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

type D1Row = Record<string, string | number | null>;

function parseD1Json(stdout: string): D1Row[] {
  const start = Math.min(...["[", "{"].map((ch) => stdout.indexOf(ch)).filter((i) => i >= 0));
  if (!Number.isFinite(start) || start < 0) throw new Error(`D1 không trả JSON:\n${stdout.slice(0, 800)}`);
  const payload = JSON.parse(stdout.slice(start)) as unknown;
  const batch = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "results" in payload
      ? (payload as { results: unknown }).results
      : payload;
  const first = Array.isArray(batch) ? batch[0] : batch;
  if (first && typeof first === "object" && "results" in first && Array.isArray((first as { results: D1Row[] }).results)) {
    return (first as { results: D1Row[] }).results;
  }
  return Array.isArray(first) ? (first as D1Row[]) : [];
}

function d1Query(command: string, remote: boolean) {
  const args = ["wrangler", "d1", "execute", "ops-monical", remote ? "--remote" : "--local", "--json", "--command", command];
  const result = spawnSync("npx", args, { encoding: "utf8", cwd: process.cwd() });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler d1 execute failed (${result.status})`);
  }
  return parseD1Json(result.stdout || "[]");
}

function d1Apply(file: string, remote: boolean) {
  const args = ["wrangler", "d1", "execute", "ops-monical", remote ? "--remote" : "--local", "--yes", `--file=${file}`];
  const result = spawnSync("npx", args, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0) throw new Error(`wrangler d1 execute --file failed (${result.status})`);
}

function typeScore(type: string) {
  const name = type.toUpperCase();
  if (name === "STANDARD PLUS") return 0;
  if (name.includes("STANDARD") && name.includes("PLUS")) return 1;
  if (name === "STANDARD VIEW") return 2;
  if (name.includes("STANDARD") && name.includes("VIEW")) return 3;
  if (name === "STANDARD") return 4;
  if (name.includes("STANDARD")) return 5;
  return 99;
}

function nextOpsCode(rows: { pms_code?: string | null; created_at?: string | null }[], at: string) {
  const month = at.slice(5, 7);
  const yearMonth = at.slice(0, 7);
  const used = new Set<string>();
  const seqs: number[] = [];
  for (const row of rows) {
    const code = String(row.pms_code || "").trim();
    if (code) used.add(code);
    const parsed = parseOpsBookingCode(code);
    if (!parsed || String(parsed.month).padStart(2, "0") !== month) continue;
    if (String(row.created_at || "").slice(0, 7) !== yearMonth) continue;
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

function pickRoom(
  rooms: { id: string; number: string; type: string }[],
  clashes: { room_id: string; guest_name: string; check_in: string; check_out: string; status: string }[],
  wanted: string,
) {
  const clashByRoom = new Map<string, typeof clashes>();
  for (const row of clashes) {
    const list = clashByRoom.get(row.room_id) || [];
    list.push(row);
    clashByRoom.set(row.room_id, list);
  }
  const ranked = [...rooms].sort(
    (a, b) => typeScore(a.type) - typeScore(b.type) || a.number.localeCompare(b.number, "vi"),
  );
  const pool = wanted ? ranked.filter((row) => row.number === wanted || row.id === wanted) : ranked.filter((row) => typeScore(row.type) < 99);
  if (wanted && !pool.length) throw new Error(`Không thấy phòng ${wanted}`);
  const open = (pool.length ? pool : ranked).filter((row) => !(clashByRoom.get(row.id) || []).length);
  const hit = open[0] || (pool[0] ?? ranked[0]);
  if (!hit) throw new Error("Không có phòng để gán");
  return { room: hit, clash: clashByRoom.get(hit.id) || [] };
}

async function main() {
  const remote = process.argv.includes("--remote");
  const apply = process.argv.includes("--apply");
  const roomFlag = argValue("--room").replace(/^p\.?/i, "");
  const createdAt = `${BOOKING.checkIn}T07:00:00.000Z`;

  const existing = d1Query(
    `SELECT id, booking_id, room_id, pms_code, status, guest_name, check_in, check_out, deposit, transfer_paid, company_paid, notes
     FROM room_sales
     WHERE id = ${sqlLiteral(BOOKING.id)}
        OR (guest_name = ${sqlLiteral(BOOKING.guestName)} AND check_in = ${sqlLiteral(BOOKING.checkIn)} AND check_out = ${sqlLiteral(BOOKING.checkOut)})`,
    remote,
  );
  if (existing.length) {
    const row = existing[0];
    const samePay =
      Number(row.transfer_paid || 0) === BOOKING.transferPaid &&
      Number(row.company_paid || 0) === BOOKING.companyPaid &&
      Number(row.deposit || 0) === deposit &&
      String(row.pms_code || "") === BOOKING.pmsCode;
    if (samePay) {
      console.log(`Đã có booking, bỏ qua:\n${JSON.stringify(existing, null, 2)}`);
      return;
    }
    const stayNow = new Date().toISOString();
    const statements = [
      `UPDATE room_sales SET
        pms_code = ${sqlLiteral(BOOKING.pmsCode)},
        transfer_paid = ${BOOKING.transferPaid},
        company_paid = ${BOOKING.companyPaid},
        deposit = ${deposit},
        notes = ${sqlLiteral(BOOKING.notes)},
        updated_at = ${sqlLiteral(stayNow)}
       WHERE id = ${sqlLiteral(String(row.id))};`,
      `UPDATE stays SET
        pms_code = ${sqlLiteral(BOOKING.pmsCode)},
        payment_note = ${sqlLiteral("Cọc CT 840k · CK CN 840k+560k")},
        notes = ${sqlLiteral(BOOKING.notes)},
        updated_at = ${sqlLiteral(stayNow)}
       WHERE id = ${sqlLiteral(BOOKING.stayId)} OR pms_code = ${sqlLiteral(String(row.pms_code || ""))};`,
      `INSERT INTO audit_logs (id, entity, entity_id, action, actor_id, before_json, after_json, created_at)
       VALUES (
         ${sqlLiteral(`${BOOKING.auditId}-code`)}, 'room_sale', ${sqlLiteral(String(row.id))}, 'update',
         'u-quanly',
         ${sqlLiteral(JSON.stringify({ pmsCode: row.pms_code, deposit: row.deposit, transferPaid: row.transfer_paid, companyPaid: row.company_paid }))},
         ${sqlLiteral(JSON.stringify({ pmsCode: BOOKING.pmsCode, deposit, transferPaid: BOOKING.transferPaid, companyPaid: BOOKING.companyPaid }))},
         ${sqlLiteral(stayNow)}
       );`,
    ];
    console.log(remote ? "Prod D1" : "Local D1");
    console.log(`Sửa mã ${row.pms_code} → ${BOOKING.pmsCode}`);
    console.log(`Thu       CT ${BOOKING.companyPaid.toLocaleString("vi-VN")} + CK CN ${BOOKING.transferPaid.toLocaleString("vi-VN")} = ${deposit.toLocaleString("vi-VN")}₫`);
    console.log(`Còn       ${Math.max(0, quote.total - deposit).toLocaleString("vi-VN")}₫`);
    if (!apply) {
      console.log("\nDry-run. Thêm --apply để ghi.");
      return;
    }
    mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
    const file = join(process.cwd(), "tmp", "import-booking-00.sql");
    writeFileSync(file, statements.join("\n"));
    d1Apply(file, remote);
    console.log(`Đã cập nhật ${row.pms_code} · ${BOOKING.guestName}`);
    return;
  }

  const rooms = d1Query(`SELECT id, number, type, ops_status FROM rooms ORDER BY number`, remote) as {
    id: string;
    number: string;
    type: string;
    ops_status?: string;
  }[];
  const types = d1Query(`SELECT name, base_rate, weekend_rate FROM room_types ORDER BY sort_order`, remote);
  const clashes = d1Query(
    `SELECT room_id, guest_name, check_in, check_out, status
     FROM room_sales
     WHERE status IN ('reserved', 'inhouse')
       AND check_in < ${sqlLiteral(BOOKING.checkOut)}
       AND check_out > ${sqlLiteral(BOOKING.checkIn)}`,
    remote,
  ) as { room_id: string; guest_name: string; check_in: string; check_out: string; status: string }[];
  const codes = d1Query(`SELECT pms_code, created_at FROM room_sales`, remote) as { pms_code: string | null; created_at: string | null }[];
  const actor = d1Query(`SELECT id, username, full_name FROM users WHERE username = 'quanly' LIMIT 1`, remote)[0];
  if (!actor?.id) throw new Error("Không thấy user quanly");

  const { room, clash } = pickRoom(
    rooms.map((row) => ({ id: String(row.id), number: String(row.number), type: String(row.type) })),
    clashes,
    roomFlag,
  );
  if (clash.length) {
    throw new Error(`P.${room.number} đang bán ${clash[0].check_in} → ${clash[0].check_out} (${clash[0].guest_name})`);
  }

  const pmsCode = BOOKING.pmsCode || nextOpsCode(codes, createdAt);
  const stayNow = `${BOOKING.checkOut}T05:00:00.000Z`;
  const afterJson = JSON.stringify({
    id: BOOKING.id,
    bookingId: BOOKING.id,
    roomId: room.id,
    guestName: BOOKING.guestName,
    source: BOOKING.source,
    status: BOOKING.status,
    checkIn: BOOKING.checkIn,
    checkOut: BOOKING.checkOut,
    rate: BOOKING.rate,
    discountKind: BOOKING.discountKind,
    discountValue: BOOKING.discountValue,
    deposit,
    companyPaid: BOOKING.companyPaid,
    transferPaid: BOOKING.transferPaid,
    pmsCode,
  });

  const statements = [
    `INSERT INTO room_sales (
      id, booking_id, room_id, guest_name, guest_phone, origin, source, status,
      check_in, check_out, adults, children, rate, discount_kind, discount_value,
      deposit, cash_paid, transfer_paid, company_paid, breakfast, breakfast_adults, breakfast_children,
      cars, bikes, pms_code, notes, created_at, updated_at, created_by, updated_by
    ) VALUES (
      ${sqlLiteral(BOOKING.id)}, ${sqlLiteral(BOOKING.id)}, ${sqlLiteral(room.id)}, ${sqlLiteral(BOOKING.guestName)}, NULL,
      ${sqlLiteral(BOOKING.origin)}, ${sqlLiteral(BOOKING.source)}, ${sqlLiteral(BOOKING.status)},
      ${sqlLiteral(BOOKING.checkIn)}, ${sqlLiteral(BOOKING.checkOut)}, ${BOOKING.adults}, ${BOOKING.children},
      ${BOOKING.rate}, ${sqlLiteral(BOOKING.discountKind)}, ${BOOKING.discountValue},
      ${deposit}, 0, ${BOOKING.transferPaid}, ${BOOKING.companyPaid}, ${BOOKING.breakfast}, ${BOOKING.adults}, 0,
      0, 0, ${sqlLiteral(pmsCode)}, ${sqlLiteral(BOOKING.notes)},
      ${sqlLiteral(createdAt)}, ${sqlLiteral(stayNow)}, ${sqlLiteral(String(actor.id))}, ${sqlLiteral(String(actor.id))}
    );`,
    `INSERT INTO stays (
      id, pms_code, origin, source, room_id, guest_name, guest_phone, status,
      arrival_date, departure_date, adults, children, breakfast,
      pms_booking_ok, pms_checkin_ok, pms_checkout_ok, invoice_ok, payment_note,
      checkin_at, registration_due_at, registration_done_at, registration_reason, notes,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      ${sqlLiteral(BOOKING.stayId)}, ${sqlLiteral(pmsCode)}, ${sqlLiteral(BOOKING.origin)}, ${sqlLiteral(BOOKING.source)},
      ${sqlLiteral(room.id)}, ${sqlLiteral(BOOKING.guestName)}, NULL, 'departed',
      ${sqlLiteral(BOOKING.checkIn)}, ${sqlLiteral(BOOKING.checkOut)}, ${BOOKING.adults}, ${BOOKING.children}, ${BOOKING.breakfast},
      1, 1, 1, 0, ${sqlLiteral("Cọc CT 840k · CK CN 840k+560k")},
      ${sqlLiteral(`${BOOKING.checkIn}T07:00:00.000Z`)}, NULL, ${sqlLiteral(`${BOOKING.checkIn}T07:30:00.000Z`)}, NULL,
      ${sqlLiteral(BOOKING.notes)}, ${sqlLiteral(createdAt)}, ${sqlLiteral(stayNow)},
      ${sqlLiteral(String(actor.id))}, ${sqlLiteral(String(actor.id))}
    );`,
    `INSERT INTO audit_logs (id, entity, entity_id, action, actor_id, before_json, after_json, created_at)
     VALUES (
       ${sqlLiteral(BOOKING.auditId)}, 'room_sale', ${sqlLiteral(BOOKING.id)}, 'create',
       ${sqlLiteral(String(actor.id))}, NULL, ${sqlLiteral(afterJson)}, ${sqlLiteral(createdAt)}
     );`,
  ];

  console.log(remote ? "Prod D1" : "Local D1");
  console.log("Hạng phòng trên hệ thống:");
  for (const type of types) console.log(`  ${type.name} · ${type.base_rate}/${type.weekend_rate}`);
  console.log(`Khách     ${BOOKING.guestName}`);
  console.log(`Phòng     P.${room.number} · ${room.type}`);
  console.log(`Ngày      ${BOOKING.checkIn} → ${BOOKING.checkOut} · ${quote.nights} đêm`);
  console.log(`Giá       ${BOOKING.rate.toLocaleString("vi-VN")} × ${quote.nights} − ${BOOKING.discountValue}% = ${quote.total.toLocaleString("vi-VN")}₫`);
  console.log(`Thu       CT ${BOOKING.companyPaid.toLocaleString("vi-VN")} + CK CN ${BOOKING.transferPaid.toLocaleString("vi-VN")} = ${deposit.toLocaleString("vi-VN")}₫`);
  console.log(`Còn       ${Math.max(0, quote.total - deposit).toLocaleString("vi-VN")}₫`);
  console.log(`Mã Ops    ${pmsCode}`);
  console.log(`Actor     ${actor.username} (${actor.id})`);

  if (!apply) {
    console.log("\nDry-run. Thêm --apply để ghi.");
    return;
  }

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  const file = join(process.cwd(), "tmp", "import-booking-00.sql");
  writeFileSync(file, statements.join("\n"));
  d1Apply(file, remote);
  console.log(`Đã import ${pmsCode} · P.${room.number} · ${BOOKING.guestName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
