#!/usr/bin/env node
/**
 * Refresh ops-staging D1 from production.
 * Does not copy push_subscriptions (would notify real devices).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const wrangler = ["npx", "wrangler"];
mkdirSync("tmp", { recursive: true });

function run(args, opts = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    ...opts,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([...wrangler, "d1", "export", "ops-monical", "--remote", "--output", "tmp/ops-prod.sql", "--skip-confirmation"]);

const sql = readFileSync("tmp/ops-prod.sql", "utf8")
  .split("\n")
  .filter((line) => !line.includes('INSERT INTO "push_subscriptions"'))
  .join("\n");
writeFileSync("tmp/ops-staging.sql", sql);

run([...wrangler, "d1", "execute", "ops-staging", "--remote", "--yes", "--file", "tmp/ops-staging.sql"]);
run([
  ...wrangler,
  "d1",
  "execute",
  "ops-staging",
  "--remote",
  "--yes",
  "--command",
  "DELETE FROM push_subscriptions;",
]);

console.log("Staging D1 refreshed from prod (push subscriptions omitted).");
