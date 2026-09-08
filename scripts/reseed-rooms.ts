import { spawnSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/db/schema";
import { SCHEMA_SQL } from "../src/lib/db/migrate";
import { syncRoomCatalog } from "../src/lib/db/seed";
import { ROOM_REMAP, ROOM_SEED, ROOM_TYPE_SEED, floorOf, roomIdOf } from "../src/lib/rooms-catalog";

async function reseedLocal() {
  const url = `file:${join(process.cwd(), "data", "ops.db")}`;
  const client = createClient({ url });
  await client.executeMultiple(SCHEMA_SQL);
  const db = drizzle(client, { schema });
  await syncRoomCatalog(db, { prune: true });
  const rooms = await db.select().from(schema.rooms);
  const types = await db.select().from(schema.roomTypes);
  console.log(`Local: ${types.length} hạng, ${rooms.length} phòng`);
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function reseedRemote() {
  const now = new Date().toISOString();
  const statements = [
    `CREATE TABLE IF NOT EXISTS room_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);`,
  ];
  for (const type of ROOM_TYPE_SEED) {
    statements.push(`INSERT INTO room_types (id, code, name, sort_order)
SELECT ${sqlLiteral(type.id)}, ${sqlLiteral(type.code)}, ${sqlLiteral(type.name)}, ${type.sortOrder}
WHERE NOT EXISTS (SELECT 1 FROM room_types WHERE id = ${sqlLiteral(type.id)} OR code = ${sqlLiteral(type.code)});`);
    statements.push(`UPDATE room_types SET name = ${sqlLiteral(type.name)}, sort_order = ${type.sortOrder}, code = ${sqlLiteral(type.code)}
WHERE id = ${sqlLiteral(type.id)} OR code = ${sqlLiteral(type.code)};`);
  }
  for (const [fromId, toId] of Object.entries(ROOM_REMAP)) {
    for (const table of ["stays", "tasks", "guest_requests", "form_submissions", "incidents"]) {
      statements.push(`UPDATE ${table} SET room_id = ${sqlLiteral(toId)} WHERE room_id = ${sqlLiteral(fromId)};`);
    }
  }
  for (const def of ROOM_SEED) {
    const id = roomIdOf(def.number);
    statements.push(`UPDATE rooms SET floor = ${floorOf(def.number)}, type = ${sqlLiteral(def.type)}, updated_at = ${sqlLiteral(now)}
WHERE number = ${sqlLiteral(def.number)};`);
    statements.push(`INSERT INTO rooms (id, number, floor, type, ops_status, hk_status, assigned_to, ooo_reason, ooo_approved, notes, updated_at, updated_by)
SELECT ${sqlLiteral(id)}, ${sqlLiteral(def.number)}, ${floorOf(def.number)}, ${sqlLiteral(def.type)}, 'vacant_clean', 'ins', NULL, NULL, 0, NULL, ${sqlLiteral(now)}, NULL
WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE number = ${sqlLiteral(def.number)} OR id = ${sqlLiteral(id)});`);
  }
  const official = ROOM_SEED.map((row) => sqlLiteral(row.number)).join(", ");
  for (const table of ["stays", "tasks", "guest_requests", "form_submissions", "incidents"]) {
    statements.push(`UPDATE ${table} SET room_id = NULL WHERE room_id IN (SELECT id FROM rooms WHERE number NOT IN (${official}));`);
  }
  statements.push(`DELETE FROM rooms WHERE number NOT IN (${official});`);

  const file = join(process.cwd(), "data", "reseed-rooms.remote.sql");
  writeFileSync(file, statements.join("\n"));
  const result = spawnSync("npx", ["wrangler", "d1", "execute", "ops-monical", "--remote", `--file=${file}`], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed; SQL left at ${file}`);
  }
  unlinkSync(file);
}

async function main() {
  await reseedLocal();
  if (process.argv.includes("--remote")) await reseedRemote();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
