/** Removes E2E test rows created by verify-emergency.mjs. Safe to re-run. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 20 });

try {
  await sql.unsafe("delete from emergency_cases where walk_in->>'name' in ('E2E Patient','Triage Test Patient')");
  await sql.unsafe("delete from accounts where email in ('e2e-admin@test.dev','triage-admin@test.dev')");
  await sql.unsafe("update beds set status='available', reserved_for=null, reserved_at=null, patient_id=null, occupied_since=null");
  await sql.unsafe("delete from bed_audit");
  const beds = await sql`select count(*)::int as n from beds where status='available'`;
  const cases = await sql`select count(*)::int as n from emergency_cases`;
  const accs = await sql`select count(*)::int as n from accounts`;
  console.log(`cleanup ok — beds available: ${beds[0].n}, emergency cases: ${cases[0].n}, accounts: ${accs[0].n}`);
} finally {
  await sql.end();
}
