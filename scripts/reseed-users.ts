import { spawnSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/db/schema";
import { RETIRED_USERNAMES, DEPT_SEED, STAFF_SEED, syncDepartments, syncStaffUsers } from "../src/lib/db/seed";
import { hashPassword } from "../src/lib/password";
import { DEMO_PASSWORD } from "../src/lib/constants";

async function reseedLocal() {
  const url = `file:${join(process.cwd(), "data", "ops.db")}`;
  const db = drizzle(createClient({ url }), { schema });
  await syncDepartments(db);
  await syncStaffUsers(db, { resetPasswords: true });
  const rows = await db.select({ username: schema.users.username, fullName: schema.users.fullName, active: schema.users.active }).from(schema.users);
  console.log("Local users:");
  for (const row of rows) {
    console.log(`  ${row.active ? "on " : "off"} ${row.username} — ${row.fullName}`);
  }
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function reseedRemote() {
  const now = new Date().toISOString();
  const statements: string[] = [];
  for (const dept of DEPT_SEED) {
    statements.push(`INSERT INTO departments (id, code, name)
SELECT ${sqlLiteral(dept.id)}, ${sqlLiteral(dept.code)}, ${sqlLiteral(dept.name)}
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE id = ${sqlLiteral(dept.id)} OR code = ${sqlLiteral(dept.code)});`);
  }
  for (const person of STAFF_SEED) {
    const hash = await hashPassword(DEMO_PASSWORD);
    const cols = `${sqlLiteral(person.id)}, ${sqlLiteral(person.username)}, ${sqlLiteral(hash)}, ${sqlLiteral(person.fullName)}, ${sqlLiteral(person.role)}, ${sqlLiteral(person.departmentId)}, ${sqlLiteral(person.phone)}, 1, ${sqlLiteral(now)}, ${sqlLiteral(now)}`;
    statements.push(`UPDATE users SET
  username = ${sqlLiteral(person.username)},
  full_name = ${sqlLiteral(person.fullName)},
  role = ${sqlLiteral(person.role)},
  department_id = ${sqlLiteral(person.departmentId)},
  phone = ${sqlLiteral(person.phone)},
  active = 1,
  password_hash = ${sqlLiteral(hash)},
  updated_at = ${sqlLiteral(now)}
WHERE username = ${sqlLiteral(person.username)} OR id = ${sqlLiteral(person.id)};`);
    statements.push(`INSERT INTO users (id, username, password_hash, full_name, role, department_id, phone, active, created_at, updated_at)
SELECT ${cols}
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = ${sqlLiteral(person.username)} OR id = ${sqlLiteral(person.id)});`);
  }
  statements.push(
    `UPDATE users SET active = 0, updated_at = ${sqlLiteral(now)} WHERE username IN (${RETIRED_USERNAMES.map(sqlLiteral).join(", ")});`,
  );
  const file = join(process.cwd(), "data", "reseed-users.remote.sql");
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
  const remote = process.argv.includes("--remote");
  await reseedLocal();
  if (remote) await reseedRemote();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
