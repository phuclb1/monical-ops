import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { SCHEMA_PATCHES, SCHEMA_SQL } from "../src/lib/db/migrate";
import { wipeAllLocal } from "../src/lib/db/seed";
import { currentShiftType, todayVN } from "../src/lib/datetime";

async function main() {
  const url = `file:${join(process.cwd(), "data", "ops.db")}`;
  const client = createClient({ url });
  await client.executeMultiple(SCHEMA_SQL);
  const db = drizzle(client, { schema });
  for (const stmt of SCHEMA_PATCHES) {
    try {
      await db.run(stmt);
    } catch {
      // already applied
    }
  }
  await wipeAllLocal(db);

  const today = todayVN();
  const users = await db
    .select({
      username: schema.users.username,
      fullName: schema.users.fullName,
      role: schema.users.role,
      active: schema.users.active,
    })
    .from(schema.users);
  const stays = await db
    .select({
      guest: schema.stays.guestName,
      status: schema.stays.status,
      roomId: schema.stays.roomId,
    })
    .from(schema.stays);
  const tasks = await db
    .select({
      id: schema.tasks.id,
      kind: schema.tasks.kind,
      content: schema.tasks.content,
    })
    .from(schema.tasks);
  const vehicles = await db.select().from(schema.vehicles);
  const breakfast = (await db.select().from(schema.breakfasts))[0];
  const shift = (await db.select().from(schema.shifts).where(eq(schema.shifts.status, "open")))[0];

  console.log(`Local wipe xong · ${today} · ca ${currentShiftType()} ${shift ? "đang mở" : "chưa mở"}`);
  console.log("\nTài khoản (mật khẩu 123456):");
  for (const row of users) {
    console.log(`  ${row.active ? "on " : "off"} ${row.username.padEnd(8)} ${row.role.padEnd(10)} ${row.fullName}`);
  }
  console.log("\nKịch bản:");
  for (const row of stays) {
    console.log(`  ${row.status.padEnd(10)} ${row.roomId ?? "—"} ${row.guest}`);
  }
  console.log(`  xe        ${vehicles.map((v) => `${v.plate} ${v.location}`).join(", ") || "—"}`);
  console.log(
    `  ăn sáng   ${breakfast ? `${breakfast.date} · ${breakfast.adults} NL · ${breakfast.children} TE · chay ${breakfast.vegetarian} · dị ứng ${breakfast.allergy}` : "—"}`,
  );
  for (const row of tasks) {
    console.log(`  việc      ${row.kind.padEnd(14)} ${row.content}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
