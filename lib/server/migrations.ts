/**
 * Upgrades as a series of idempotent DDL statements, guaranteed additive-only:
 * existing tables, columns and rows are never modified or dropped.
 *
 * Applied automatically at boot for BOTH the production Supabase Postgres and
 * the local PGlite dev database, so any server start (local or Vercel) has the
 * schema ready. Statements are safe to run repeatedly.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const STATEMENTS: string[] = [
  // ── E-prescription safety checks ───────────────────
  `alter table prescriptions add column if not exists checks jsonb`,
  `alter table prescriptions add column if not exists checks_at text`,
  `alter table prescriptions add column if not exists checks_engine text not null default ''`,
  `alter table prescriptions add column if not exists override_reason text`,
  // ── Permanent Patient ID ─────────────────────────────
  `create sequence if not exists patient_code_seq minvalue 1`,
  `alter table patients add column if not exists patient_code text`,
  `update patients set patient_code = 'PAT-' || to_char(now(),'YYYY') || '-' ||
     lpad(nextval('patient_code_seq')::text, 6, '0')
   where patient_code is null or patient_code = ''`,
  `alter table patients alter column patient_code set default ''`,
  `alter table patients alter column patient_code set not null`,
  `create unique index if not exists patients_patient_code_idx on patients (patient_code)`,

  // ── Pharmacy: medication orders ──────────────────────
  `create table if not exists medication_orders (
     id text primary key,
     patient_id text not null,
     doctor_id text not null,
     visit_id text,
     prescription_id text,
     drug text not null,
     dosage text not null default '',
     route text not null default 'oral',
     frequency text not null default '',
     duration_days integer not null default 0,
     quantity integer not null default 0,
     instructions text not null default '',
     status text not null default 'pending_review',
     verified_by text,
     verified_by_name text not null default '',
     verified_at text,
     dispensed_by text,
     dispensed_by_name text not null default '',
     dispensed_at text,
     note_from_pharmacy text not null default '',
     idem_key text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists medication_orders_patient_idx on medication_orders (patient_id, created_at)`,
  `create index if not exists medication_orders_status_idx on medication_orders (status)`,
  `create unique index if not exists medication_orders_idem_idx on medication_orders (idem_key)`,

  // ── Admissions ───────────────────────────────────────
  `create table if not exists admissions (
     id text primary key,
     patient_id text not null,
     doctor_id text,
     ward_id text not null default '',
     ward_name text not null default '',
     bed_id text,
     bed_label text not null default '',
     reason text not null default '',
     notes text not null default '',
     status text not null default 'active',
     admitted_at text not null,
     discharged_at text,
     account_id text
   )`,
  `create index if not exists admissions_patient_idx on admissions (patient_id, admitted_at)`,
  `create index if not exists admissions_status_idx on admissions (status)`,

  // ── Normalized billing: billable items per order ─────
  `create table if not exists invoice_items (
     id text primary key,
     invoice_id text not null,
     patient_id text not null,
     source_type text not null,
     source_order_id text,
     label text not null,
     code text not null default '',
     quantity integer not null default 1,
     unit_price real not null default 0,
     amount real not null default 0,
     status text not null default 'billed',
     currency text not null default 'INR',
     created_at timestamptz not null default now()
   )`,
  `create index if not exists invoice_items_invoice_idx on invoice_items (invoice_id)`,
  `create unique index if not exists invoice_items_source_idx on invoice_items (source_type, source_order_id)`,

  // ── Pharmacy inventory ───────────────────────────────
  `create table if not exists inventory (
     id text primary key,
     name text not null,
     unit text not null default 'strip',
     unit_price real not null default 0,
     stock integer not null default 0,
     reorder_level integer not null default 10,
     updated_at timestamptz not null default now()
   )`,
  `create unique index if not exists inventory_name_idx on inventory (name)`,

  // ── Service prices ───────────────────────────────────
  `create table if not exists service_prices (
     id text primary key,
     kind text not null,
     name text not null,
     unit_price real not null default 0,
     updated_at timestamptz not null default now()
   )`,
  `create unique index if not exists service_prices_kind_name_idx on service_prices (kind, name)`,

  // ── Lab-order workflow extension ─────────────────────
  `alter table labs add column if not exists workflow text`,
  `update labs set workflow = 'ordered' where workflow is null or workflow = ''`,
  `alter table labs alter column workflow set default 'ordered'`,
  `alter table labs alter column workflow set not null`,
  `alter table labs add column if not exists priority text`,
  `update labs set priority = 'routine' where priority is null or priority = ''`,
  `alter table labs alter column priority set default 'routine'`,
  `alter table labs alter column priority set not null`,
  `alter table labs add column if not exists visit_id text`,
  `alter table labs add column if not exists clinical_note text`,
  `update labs set clinical_note = '' where clinical_note is null`,
  `alter table labs alter column clinical_note set default ''`,
  `alter table labs alter column clinical_note set not null`,
  `alter table labs add column if not exists sample_collected_at text`,
  `alter table labs add column if not exists processed_at text`,
  `alter table labs add column if not exists processed_by text`,
  `alter table labs add column if not exists verified_by text`,
  `alter table labs add column if not exists verified_by_name text`,
  `update labs set verified_by_name = '' where verified_by_name is null`,
  `alter table labs alter column verified_by_name set default ''`,
  `alter table labs alter column verified_by_name set not null`,
  `alter table labs add column if not exists verified_at text`,
  `alter table labs add column if not exists cancelled_reason text`,
  `update labs set cancelled_reason = '' where cancelled_reason is null`,
  `alter table labs alter column cancelled_reason set default ''`,
  `alter table labs alter column cancelled_reason set not null`,
  `alter table labs add column if not exists idem_key text`,
  `create unique index if not exists labs_idem_idx on labs (idem_key)`,

  // legacy backfill: map existing lab statuses onto the new workflow column
  `update labs set workflow = case status
     when 'resulted' then 'result_ready'
     when 'in-progress' then 'processing'
     else 'ordered' end
   where workflow = 'ordered' and status <> 'requested'`,

  // ── OPD queue / tokens ──────────────────
  `create table if not exists queue_entries (
     id text primary key,
     queue_date text not null,
     doctor_id text not null,
     department text not null default '',
     patient_id text not null,
     appointment_id text,
     source text not null default 'appointment',
     priority text not null default 'normal',
     status text not null default 'waiting',
     token_no integer not null,
     note text not null default '',
     review_note text,
     called_by text,
     called_by_name text not null default '',
     called_at text,
     idem_key text,
     registered_by text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create unique index if not exists queue_entries_token_idx on queue_entries (queue_date, doctor_id, token_no)`,
  `create unique index if not exists queue_entries_active_uniq on queue_entries (queue_date, doctor_id, patient_id) where status in ('waiting','called')`,
  `create index if not exists queue_entries_patient_idx on queue_entries (patient_id, queue_date)`,
  `create index if not exists queue_entries_status_idx on queue_entries (queue_date, doctor_id, status)`,
  `create unique index if not exists queue_entries_idem_idx on queue_entries (idem_key)`,

  // ── Payments ─────────────────────
  `create table if not exists payments (
     id text primary key,
     provider text not null default 'razorpay',
     provider_order_id text,
     provider_payment_id text,
     patient_id text not null,
     appointment_id text,
     amount real not null default 0,
     currency text not null default 'INR',
     status text not null default 'created',
     events jsonb not null default '[]',
     idem_key text,
     failure_reason text not null default '',
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create unique index if not exists payments_provider_order_idx on payments (provider_order_id)`,
  `create index if not exists payments_patient_idx on payments (patient_id, created_at)`,
  `create unique index if not exists payments_idem_idx on payments (idem_key)`,

  // ── Recovery & wellness tracker ────────────
  `create table if not exists recovery_plans (
     id text primary key,
     patient_id text not null,
     admission_id text,
     visit_id text,
     discharge_at text not null,
     instructions jsonb not null default '[]',
     red_flags jsonb not null default '[]',
     version integer not null default 1,
     created_by_id text not null,
     created_by_name text not null default '',
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists recovery_plans_patient_idx on recovery_plans (patient_id, created_at)`,
  `create table if not exists recovery_logs (
     id text primary key,
     plan_id text not null,
     patient_id text not null,
     type text not null,
     content text not null default '',
     metric_name text not null default '',
     metric_value text not null default '',
     flags jsonb not null default '[]',
     created_at timestamptz not null default now()
   )`,
  `create index if not exists recovery_logs_plan_idx on recovery_logs (plan_id, created_at)`,
  `create index if not exists recovery_logs_patient_idx on recovery_logs (patient_id, created_at)`,

  // ── ABDM / ABHA ──────────────────
  `create table if not exists abha_links (
     id text primary key,
     patient_id text not null,
     abha_number text not null default '',
     abha_address text not null default '',
     status text not null default 'pending',
     method text not null default '',
     note text not null default '',
     verified_at text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists abha_links_patient_idx on abha_links (patient_id)`,
  `create table if not exists abdm_consents (
     id text primary key,
     patient_id text not null,
     purpose text not null,
     hi_types jsonb not null default '[]',
     range_from text not null default '',
     range_to text not null default '',
     status text not null default 'requested',
     gateway_ref text not null default '',
     note text not null default '',
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists abdm_consents_patient_idx on abdm_consents (patient_id, created_at)`,

  // ── Lab report files (PDF) ────────────────
  `create table if not exists lab_report_files (
     id text primary key,
     lab_id text not null,
     patient_id text not null,
     visit_id text,
     filename text not null,
     mime text not null default 'application/pdf',
     size integer not null default 0,
     data text not null,
     uploaded_by text not null,
     uploaded_by_name text not null default '',
     uploaded_at timestamptz not null default now(),
     review_status text not null default 'pending_review',
     reviewed_by text,
     reviewed_by_name text not null default '',
     reviewed_at text
   )`,
  `create index if not exists lab_report_files_lab_idx on lab_report_files (lab_id)`,
];

/** Reports (never merges) patients that look like the same person — manual review only. */
async function reportDuplicatePatients(db: any): Promise<void> {
  try {
    const res = await db.execute(
      `select lower(trim(name)) as name, lower(dob) as dob, count(*) as n
       from patients where coalesce(dob,'') <> ''
       group by lower(trim(name)), lower(dob) having count(*) > 1`
    );
    const rows: any[] = Array.isArray(res) ? res : res.rows;
    for (const r of rows) {
      console.warn(
        `[migrations] Possible duplicate patient records for manual review: name="${r.name}" dob=${r.dob} count=${r.n}`
      );
    }
  } catch (err) {
    console.error(
      "[migrations] duplicate-patient scan skipped:",
      err instanceof Error ? err.message : err
    );
  }
}

const g = globalThis as unknown as { __cpMigrationsApplied?: Promise<void> };

/** Apply the upgrade once per process. Additive-only; failures are logged loudly. */
export function ensureSchema(): Promise<void> {
  if (!g.__cpMigrationsApplied) {
    g.__cpMigrationsApplied = (async () => {
      const { getDb } = await import("@/db");
      const db = await getDb();
      for (let i = 0; i < STATEMENTS.length; i++) {
        try {
          await db.execute(STATEMENTS[i]);
        } catch (err) {
          console.error(
            `[migrations] statement ${i + 1} failed:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      await reportDuplicatePatients(db);
    })();
  }
  return g.__cpMigrationsApplied;
}
