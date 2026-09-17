/**
 * Pushes drizzle/0000_init.sql to the DATABASE_URL database.
 * Usage: node scripts/push-schema.mjs   (reads .env.local if present)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// minimal .env.local loader (no dotenv dependency needed)
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(1);
}

const { default: postgres } = await import("postgres");
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 20 });

const full = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
const statements = full
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

try {
  for (const stmt of statements) {
    await sql.unsafe(stmt);
    console.log("ok:", stmt.split("\n")[0].slice(0, 60));
  }
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`;
  console.log("\nTables in database:", tables.map((t) => t.table_name).join(", "));
  console.log("Schema push complete ✔");
} catch (err) {
  console.error("Push failed:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
