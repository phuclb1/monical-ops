import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { join } from "node:path";
import * as schema from "../src/lib/db/schema";
import { SCHEMA_SQL } from "../src/lib/db/migrate";
import { syncReceptionRoster } from "../src/lib/db/seed";

async function main() {
  const client = createClient({ url: `file:${join(process.cwd(), "data", "ops.db")}` });
  await client.executeMultiple(SCHEMA_SQL);
  const db = drizzle(client, { schema });
  await syncReceptionRoster(db);
  const slots = await db.select().from(schema.receptionWeekSlots);
  console.log(`Week slots: ${slots.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
