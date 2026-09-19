import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { resetOpsDemo } from "../src/db/seed";
import { currentShiftType, todayVN } from "../src/lib/datetime";

async function main() {
  const url = `file:${join(process.cwd(), "data", "ops.db")}`;
  const db = drizzle(createClient({ url }), { schema });
  await resetOpsDemo(db);
  const today = todayVN();
  const shift = (await db.select().from(schema.shifts).where(eq(schema.shifts.status, "open")))[0];
  const stays = await db.select({ id: schema.stays.id, status: schema.stays.status, arrivalDate: schema.stays.arrivalDate, departureDate: schema.stays.departureDate }).from(schema.stays);
  const tasks = await db.select({ id: schema.tasks.id, kind: schema.tasks.kind }).from(schema.tasks);
  console.log(`Today ${today} · ca ${currentShiftType()}`);
  console.log(`Open shift: ${shift?.type ?? "none"} ${shift?.date ?? ""}`);
  console.log("Stays:");
  for (const row of stays) {
    console.log(`  ${row.id} ${row.status} ${row.arrivalDate} → ${row.departureDate}`);
  }
  console.log(`Tasks: ${tasks.map((row) => row.kind).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
