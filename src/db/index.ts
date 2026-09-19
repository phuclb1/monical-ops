import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { SCHEMA_PATCHES, SCHEMA_SQL } from "./migrate";
import { rekeyLegacyOpsBookingCodes } from "./ops-codes";
import { seedIfEmpty } from "./seed";

export type AppDb = LibSQLDatabase<typeof schema>;

let localDb: AppDb | null = null;
let ready: Promise<void> | null = null;

export async function getDb(): Promise<AppDb> {
  const forceD1 = process.env.USE_D1 === "1" || process.env.NODE_ENV === "production";
  const d1 = forceD1 ? await getD1Db() : null;
  try {
    if (d1) {
      if (!ready) ready = prepareD1(d1);
      await ready;
      return d1;
    }
    if (!localDb) localDb = await createLocalDb();
    if (!ready) ready = prepareLocal(localDb);
    await ready;
    return localDb;
  } catch (error) {
    ready = null;
    throw error;
  }
}

async function getD1Db(): Promise<AppDb | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    if (env && "DB" in env && env.DB) {
      const { drizzle: drizzleD1 } = await import("drizzle-orm/d1");
      return drizzleD1(env.DB, { schema }) as unknown as AppDb;
    }
  } catch {
    return null;
  }
  return null;
}

async function createLocalDb(): Promise<AppDb> {
  const { createClient } = await import("@libsql/client");
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const url = process.env.DATABASE_URL?.startsWith("libsql:")
    ? process.env.DATABASE_URL
    : `file:${join(dir, "ops.db")}`;
  return drizzle(createClient({ url }), { schema });
}

async function prepareD1(db: AppDb) {
  // Production D1 is migrated via wrangler/drizzle, not CREATE TABLE on every isolate.
  await applyPatches(db);
  await rekeyLegacyOpsBookingCodes(db);
  await seedIfEmpty(db);
}

async function prepareLocal(db: AppDb) {
  const { createClient } = await import("@libsql/client");
  const { join } = await import("node:path");
  const url = process.env.DATABASE_URL?.startsWith("libsql:")
    ? process.env.DATABASE_URL
    : `file:${join(process.cwd(), "data", "ops.db")}`;
  const client = createClient({ url });
  const statements = SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean);
  try {
    await client.executeMultiple(SCHEMA_SQL);
  } catch {
    for (const stmt of statements) {
      try {
        await client.execute(stmt);
      } catch {
        // table / index already exists, or depends on a SCHEMA_PATCHES column
      }
    }
  }
  await applyPatches(db);
  await rekeyLegacyOpsBookingCodes(db);
  await seedIfEmpty(db);
}

async function applyPatches(db: AppDb) {
  for (const stmt of SCHEMA_PATCHES) {
    try {
      await db.run(stmt);
    } catch {
      // column / index already exists on live DBs
    }
  }
}
