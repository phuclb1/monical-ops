import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingIdsOf, bookingMatchesLookup } from "../src/lib/repos/sales/queries";
import { IN_QUERY_CHUNK, mapInChunks } from "../src/lib/repos/chunk";

test("bookingIdsOf uses booking_id when present and drops seq holds", () => {
  assert.deepEqual(
    bookingIdsOf([
      { id: "sale-1", bookingId: "bk-1" },
      { id: "sale-2", bookingId: "bk-1" },
      { id: "sale-3", bookingId: null },
      { id: "seq-hold-9", bookingId: "seq-hold-9" },
    ]),
    ["bk-1", "sale-3"],
  );
});

test("bookingMatchesLookup finds a booking by room sale id", () => {
  const booking = { id: "bk-1", rooms: [{ id: "sale-a" }, { id: "sale-b" }] };
  assert.equal(bookingMatchesLookup(booking, new Set(["bk-1"])), true);
  assert.equal(bookingMatchesLookup(booking, new Set(["sale-b"])), true);
  assert.equal(bookingMatchesLookup(booking, new Set(["other"])), false);
});

test("mapInChunks pages ids and flattens results", async () => {
  const ids = Array.from({ length: IN_QUERY_CHUNK + 3 }, (_, index) => `id-${index}`);
  const seen: number[] = [];
  const rows = await mapInChunks(ids, async (chunk) => {
    seen.push(chunk.length);
    return chunk.map((id) => ({ id }));
  });
  assert.deepEqual(seen, [IN_QUERY_CHUNK, 3]);
  assert.equal(rows.length, ids.length);
  assert.equal(rows[0]?.id, "id-0");
});
