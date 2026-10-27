import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldFallbackPwaHome } from "../src/lib/pwa-recover";

test("pwa recovery only matches chunk and module load failures", () => {
  assert.equal(shouldFallbackPwaHome(new Error("Loading chunk 918 failed")), true);
  assert.equal(shouldFallbackPwaHome({ name: "ChunkLoadError", message: "Loading chunk app/page failed" }), true);
  assert.equal(shouldFallbackPwaHome("Failed to fetch dynamically imported module: https://platform.example/chunk.js"), true);
  assert.equal(shouldFallbackPwaHome(new Error("Không lưu được booking")), false);
  assert.equal(shouldFallbackPwaHome(null), false);
});
