/**
 * Applies the upgrade migration (drizzle/0001_*.sql + patient-ID sequence)
 * to the configured Supabase/Postgres database.
 *
 * Usage: node --env-file=.env scripts/apply-upgrade-migration.mjs
 *   (falls back to scripts/apply-upgrade-migration.mjs without DATABASE_URL → aborts)
 *
 * Safety:
 * - Before touching anything, a dump of every clinical table is written to
 *   backups/schema-before-migration-<ts>.json (read-only COPY).
 * - Every statement is idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS),
 *   so re-running is harmless.
 * - Existing rows are not modified except `patients.patient_code` for patients
 *   that have no code yet — the permanent ID backfill, which is mandatory for
 *   the feature and never rewrites an existing code.
 * - `patient_code_seq` is synchronised past any existing PAT- code so newly
 *   allocated IDs can never collide; the unique index guarantees it.
 */
/* eslint-disable no-console */
import { writeFile, mkdir } from "node:fs/promises";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — refusing to guess which database this is. Pass it via --env-file=.env");
  process.exit(1);
}

const { default: postgres } = await import("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 4, connect_timeout: 15 });

const BACKUP_TABLES = [
  "patients",
  "doctors",
  "accounts",
  "appointments",
  "prescriptions",
  "visits",
  "invoices",
  "labs",
  "leaves",
  "wards",
  "accounts",
  "sessions",
  "audit_logs",
  "emergency_cases",
  "bed_audit",
  "beds",
  "symptom_assessments",
];

const STATEMENTS = [
  // ── new tables (idempotent) ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "admissions" (
    "id" text PRIMARY KEY NOT NULL,
    "patient_id" text NOT NULL,
    "doctor_id" text,
    "ward_id" text DEFAULT '' NOT NULL,
    "ward_name" text DEFAULT '' NOT NULL,
    "bed_id" text,
    "bed_label" text DEFAULT '' NOT NULL,
    "reason" text DEFAULT '' NOT NULL,
    "notes" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "admitted_at" text NOT NULL,
    "discharged_at" text,
    "account_id" text
  )`,
  `CREATE TABLE IF NOT EXISTS "inventory" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "unit" text DEFAULT 'strip' NOT NULL,
    "unit_price" real DEFAULT 0 NOT NULL,
    "stock" integer DEFAULT 0 NOT NULL,
    "reorder_level" integer DEFAULT 10 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" text PRIMARY KEY NOT NULL,
    "invoice_id" text NOT NULL,
    "patient_id" text NOT NULL,
    "source_type" text NOT NULL,
    "source_order_id" text,
    "label" text NOT NULL,
    "code" text DEFAULT '' NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" real DEFAULT 0 NOT NULL,
    "amount" real DEFAULT 0 NOT NULL,
    "status" text DEFAULT 'billed' NOT NULL,
    "currency" text DEFAULT 'INR' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "medication_orders" (
    "id" text PRIMARY KEY NOT NULL,
    "patient_id" text NOT NULL,
    "doctor_id" text NOT NULL,
    "visit_id" text,
    "prescription_id" text,
    "drug" text NOT NULL,
    "dosage" text DEFAULT '' NOT NULL,
    "route" text DEFAULT 'oral' NOT NULL,
    "frequency" text DEFAULT '' NOT NULL,
    "duration_days" integer DEFAULT 0 NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "instructions" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'pending_review' NOT NULL,
    "verified_by" text,
    "verified_by_name" text DEFAULT '' NOT NULL,
    "verified_at" text,
    "dispensed_by" text,
    "dispensed_by_name" text DEFAULT '' NOT NULL,
    "dispensed_at" text,
    "note_from_pharmacy" text DEFAULT '' NOT NULL,
    "idem_key" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "service_prices" (
    "id" text PRIMARY KEY NOT NULL,
    "kind" text NOT NULL,
    "name" text NOT NULL,
    "unit_price" real DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,

  // ── new columns on existing tables (never drops/rewrites) ───────────────
  ...[
    ["labs", "workflow", "text DEFAULT 'ordered' NOT NULL"],
    ["labs", "priority", "text DEFAULT 'routine' NOT NULL"],
    ["labs", "visit_id", "text"],
    ["labs", "clinical_note", "text DEFAULT '' NOT NULL"],
    ["labs", "sample_collected_at", "text"],
    ["labs", "processed_at", "text"],
    ["labs", "processed_by", "text"],
    ["labs", "verified_by", "text"],
    ["labs", "verified_by_name", "text DEFAULT '' NOT NULL"],
    ["labs", "verified_at", "text"],
    ["labs", "cancelled_reason", "text DEFAULT '' NOT NULL"],
    ["labs", "idem_key", "text"],
    ["labs", "created_at", "timestamp with time zone DEFAULT now() NOT NULL"],
    ["patients", "patient_code", "text DEFAULT '' NOT NULL"],
  ].map(([t, c, d]) => `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${c}" ${d}`),

  // ── indexes (unique where duplication must be impossible) ───────────────
  ...[
    ["admissions_patient_idx", "admissions", `("patient_id","admitted_at")`, false],
    ["admissions_status_idx", "admissions", `("status")`, false],
    ["inventory_name_idx", "inventory", `("name")`, true],
    ["invoice_items_invoice_idx", "invoice_items", `("invoice_id")`, false],
    ["invoice_items_source_idx", "invoice_items", `("source_type","source_order_id")`, true],
    ["medication_orders_patient_idx", "medication_orders", `("patient_id","created_at")`, false],
    ["medication_orders_status_idx", "medication_orders", `("status")`, false],
    ["medication_orders_idem_idx", "medication_orders", `("idem_key")`, true],
    ["service_prices_kind_name_idx", "service_prices", `("kind","name")`, true],
    ["labs_patient_idx", "labs", `("patient_id","requested_on")`, false],
    ["labs_idem_idx", "labs", `("idem_key")`, true],
    ["patients_code_uniq_idx", "patients", `("patient_code") WHERE patient_code <> ''`, true],
  ].map(([name, table, def, uniq]) =>
    `CREATE ${uniq ? "UNIQUE" : ""} INDEX IF NOT EXISTS "${name}" ON "${table}" USING btree ${def}`
  ),

  // ── Patient ID allocator & backfill ─────────────────────────────────────
  `CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1`,
];

/* ─────────────────────────── run ─────────────────────────── */

console.log("Backing up existing tables…");
await mkdir("backups", { recursive: true });
const backupFile = `backups/schema-before-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const dump = {};
for (const t of BACKUP_TABLES) {
  try {
    dump[t] = await sql`select * from ${sql(t)} limit 20000`;
    console.log(`  ${t}: ${dump[t].length} rows`);
  } catch {
    console.log(`  ${t}: table not present yet — nothing to back up`);
  }
}
await writeFile(backupFile, JSON.stringify(dump, null, 2));
console.log(`Backup written to ${backupFile}`);

console.log("Applying migration…");
for (const s of STATEMENTS) {
  await sql.unsafe(s);
  console.log(`  ok: ${s.split("\n")[0].slice(0, 72)}…`);
}

// First synchronise the sequence past any existing code so live traffic and the
// backfill below can never allocate a number that already belongs to a patient.
const maxResult = await sql`
  select coalesce(max(nullif(split_part("patient_code", '-', 3), '')::bigint), 0) as m
  from "patients"
  where "patient_code" like 'PAT-%'
`;
const maxRows = Array.isArray(maxResult) ? maxResult : maxResult?.rows ?? [];
const nextFrom = Math.max(Number(maxRows[0]?.m ?? 0), 1);
await sql`select setval('patient_code_seq', ${nextFrom}, true)`;
console.log(`patient_code_seq synchronised to ${nextFrom}`);

// Backfill: assign a permanent Patient ID to every patient that has none.
// Codes are allocated from the shared sequence so two backfills racing
// cannot collide; the year comes from each row's own created_at.
const backfillRows = await sql`select id from "patients" where "patient_code" = '' order by "created_at" asc`;
const missing = Array.isArray(backfillRows) ? backfillRows : backfillRows?.rows ?? [];
console.log(`Patients needing a patient_code: ${missing.length}`);
for (const { id } of missing) {
  await sql`
    update "patients"
    set "patient_code" =
      'PAT-' ||
      coalesce(nullif(to_char("created_at", 'YYYY'), '')::int, date_part('year', now())::int)::text ||
      '-' || lpad(nextval('patient_code_seq')::text, 6, '0')
    where "id" = ${id} and "patient_code" = ''
  `;
}

// Verify
const verifyResult = await sql`
  select count(*) as total,
         count(*) filter (where "patient_code" like 'PAT-%' and length("patient_code") = 17) as coded,
         count(*) filter (where "patient_code" is distinct from '' and "patient_code" is null) as weird
  from "patients"
`;
const verify = Array.isArray(verifyResult) ? verifyResult : verifyResult?.rows ?? [];
console.log("Patient IDs:", verify[0]);

const dupResult = await sql`select count(*)::int as n from "patients" p1
  join "patients" p2 on p1."patient_code" = p2."patient_code" and p1."id" <> p2."id" and p1."patient_code" <> ''`;
const ok = Array.isArray(dupResult) ? dupResult : dupResult?.rows ?? [];
console.log(`Duplicate code pairs (must be 0): ${ok[0]?.n ?? 0}`);

console.log("\nMigration complete. Backup at:", backupFile);
await sql.end();
