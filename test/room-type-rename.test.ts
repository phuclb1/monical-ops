import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { SCHEMA_SQL } from "../src/db/migrate";
import * as schema from "../src/db/schema";
import { syncRoomCatalog } from "../src/db/seed/sync";
import type { AppDb } from "../src/db";

test("startup catalog sync keeps a renamed room type", async () => {
  const client = createClient({ url: ":memory:" });
  await client.executeMultiple(SCHEMA_SQL);
  const db = drizzle(client, { schema }) as AppDb;
  await db.insert(schema.roomTypes).values({
    id: "rt-vip",
    code: "vip",
    name: "VIP SUITE",
    sortOrder: 10,
    baseRate: 1500000,
    weekendRate: 1800000,
    adults: 2,
  });
  await db.insert(schema.rooms).values({
    id: "r-506",
    number: "506",
    floor: 5,
    type: "VIP SUITE",
    opsStatus: "vacant_clean",
    hkStatus: "ins",
    assignedTo: null,
    oooReason: null,
    oooApproved: false,
    notes: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: null,
  });

  await syncRoomCatalog(db);

  const type = (await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, "rt-vip")))[0];
  const room = (await db.select().from(schema.rooms).where(eq(schema.rooms.id, "r-506")))[0];
  assert.equal(type?.name, "VIP SUITE");
  assert.equal(type?.baseRate, 1500000);
  assert.equal(room?.type, "VIP SUITE");

  await syncRoomCatalog(db, { reset: true });
  const resetType = (await db.select().from(schema.roomTypes).where(eq(schema.roomTypes.id, "rt-vip")))[0];
  const resetRoom = (await db.select().from(schema.rooms).where(eq(schema.rooms.id, "r-506")))[0];
  assert.equal(resetType?.name, "VIP");
  assert.equal(resetRoom?.type, "VIP");
});
