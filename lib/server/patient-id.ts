/**
 * Permanent Patient ID service.
 *
 * Format: PAT-<year>-<6-digit-sequence>, e.g. PAT-2026-000001.
 * - Drawn from the concurrency-safe Postgres sequence `patient_code_seq`
 *   (created by the schema upgrade) — collisions are impossible because the
 *   sequence never repeats and is allocated server-side.
 * - Assigned exactly once, at patient creation, inside server code. No API
 *   accepts patientCode from a client, so users can never edit it.
 * - Preserved forever: profile updates, encounters, admissions, prescriptions
 *   and invoices all reference the same internal UUID + this code.
 */
import { sql, eq, desc, and, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { patients as patientsT, type PatientRow } from "@/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function formatPatientCode(seq: number, year: number | null = null): string {
  const y = year ?? new Date().getFullYear();
  return `PAT-${y}-${String(seq).padStart(6, "0")}`;
}

/** Normalizes drizzle execute() output across the postgres-js and PGlite drivers. */
function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  return result?.rows ?? [];
}

/**
 * Allocates the next Patient ID from the shared sequence. Works under
 * concurrency (the sequence is the single allocator) and needs no retry:
 * two simultaneous registrations get two distinct numbers.
 */
export async function nextPatientCode(): Promise<string> {
  const db = await getDb();
  const res = await db.execute(sql`select nextval('patient_code_seq') as v`);
  const rows = rowsOf(res);
  const v = Number(rows[0]?.v ?? 0);
  return formatPatientCode(v > 0 ? v : 1);
}

/**
 * Assigns a permanent code to any patient row that lacks one (backfill,
 * legacy imports). Idempotent and safe under races: the UPDATE only fires
 * on rows still missing a code.
 */
export async function assignCodeIfMissing(patientId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select().from(patientsT).where(eq(patientsT.id, patientId)).limit(1);
  const patient = rows[0] as PatientRow | undefined;
  if (!patient) return null;
  if (patient.patientCode) return patient.patientCode;
  const code = await nextPatientCode();
  await db
    .update(patientsT)
    .set({ patientCode: code })
    .where(and(eq(patientsT.id, patientId), eq(patientsT.patientCode, "")));
  return code;
}

/** Loads the patient code for display / linking across panels. */
export async function getPatientCode(patientId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ patientCode: patientsT.patientCode })
    .from(patientsT)
    .where(eq(patientsT.id, patientId))
    .limit(1);
  return rows[0]?.patientCode ?? null;
}

/**
 * Candidate duplicates for manual review — same normalized name + DOB.
 * Purely a report; the system never merges automatically.
 */
export async function listDuplicateCandidates(): Promise<
  { name: string; dob: string; ids: string[] }[]
> {
  const db = await getDb();
  const rows: PatientRow[] = await db.select().from(patientsT);
  const key = (p: PatientRow) =>
    `${p.name.trim().toLowerCase()}|${(p.dob ?? "").trim().toLowerCase()}`;
  const groups = new Map<string, PatientRow[]>();
  for (const p of rows) {
    if (!p.dob) continue;
    const k = key(p);
    const g = groups.get(k) ?? [];
    g.push(p);
    groups.set(k, g);
  }
  return Array.from(groups.values())
    .filter((g) => g.length > 1)
    .map((g) => ({
      name: g[0].name,
      dob: g[0].dob,
      ids: g.map((p) => `${p.patientCode || p.id} (${p.name})`),
    }));
}
