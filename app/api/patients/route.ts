import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { patients as patientsT } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount, ensureRole } from "@/lib/server/api";
import { nextPatientCode } from "@/lib/server/patient-id";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/patients — staff registration of a walk-in / emergency patient.
 *
 * NEW patients only get a genuine server-issued Patient ID (PAT-year-seq).
 * Before creating anything, an identity match is attempted on patientCode,
 * phone or exact name+dob: when a confident match exists the existing record
 * is reused (match is returned with `matched: true`) and NO duplicate is
 * created. Ambiguous name-only matches that lack a DOB are NOT auto-matched —
 * they are reported and the staff member must confirm by code/phone.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["admin", "doctor"]);
  if (roleErr) return roleErr;

  const body = await readJson<{
    name?: string;
    phone?: string;
    dob?: string;
    gender?: string;
    bloodGroup?: string;
    address?: string;
    patientCode?: string;
    /** when true, staff confirmed the proposal IS a different person */
    forceNew?: boolean;
  }>(req);

  const name = (body?.name ?? "").trim().slice(0, 120);
  const phone = (body?.phone ?? "").trim().slice(0, 20);
  const dob = (body?.dob ?? "").trim();
  const patientCode = (body?.patientCode ?? "").trim().toUpperCase();
  if (!name) return apiError("Name is required.", 422);
  if (!phone && !patientCode) {
    return apiError("A phone number or Patient ID is required for identity matching.", 422);
  }

  const db = await getDb();

  // ── Identity match ──
  if (patientCode) {
    const rows = await db.select().from(patientsT).where(eq(patientsT.patientCode, patientCode)).limit(1);
    if (rows[0]) {
      return json({ ok: true, matched: true, patient: rows[0] });
    }
    return apiError(`No patient exists with Patient ID ${patientCode}. Leave the ID empty to register a new patient.`, 404);
  }

  if (phone) {
    const rows = await db.select().from(patientsT).where(eq(patientsT.phone, phone)).limit(2);
    if (rows[0]) {
      const confident = rows.length === 1 && rows[0].name.trim().toLowerCase() === name.toLowerCase();
      if (confident || body?.forceNew !== true) {
        return json({ ok: true, matched: true, patient: rows[0], ambiguous: rows.length > 1 });
      }
    }
  }

  // Ambiguity gate: exact name+dob duplicates must be reviewed, never auto-matched.
  if (dob) {
    const dupRows = await db
      .select({ id: patientsT.id, name: patientsT.name, patientCode: patientsT.patientCode, dob: patientsT.dob, phone: patientsT.phone })
      .from(patientsT)
      .where(and(eq(patientsT.name, name), eq(patientsT.dob, dob)))
      .limit(3);
    if (dupRows.length > 0 && body?.forceNew !== true) {
      return json({
        ok: false,
        needsReview: true,
        message: `Found ${dupRows.length} existing record(s) with the same name and date of birth — confirm Patient ID / phone or force a genuinely new record.`,
        candidates: dupRows,
      }, 409);
    }
  }

  const code = await nextPatientCode();
  const rows = await db
    .insert(patientsT)
    .values({
      id: newId("P-", 8),
      patientCode: code,
      name,
      email: `walkin-${code.toLowerCase()}@registered-locally.invalid`,
      phone,
      dob,
      gender: (body?.gender ?? "other").toString().slice(0, 10),
      bloodGroup: (body?.bloodGroup ?? "").toString().slice(0, 8),
      address: (body?.address ?? "").toString().slice(0, 300),
      allergies: [],
      conditions: [],
      immunizations: [],
      insurance: { provider: "", number: "" },
    })
    .returning();
  const out: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  if (!out[0]) return apiError("Patient registration failed — please retry.", 500);

  await recordAudit(account, {
    action: "create",
    entity: "patient",
    entityId: out[0].id,
    detail: `walk-in registration · Patient ID ${code} · by ${account.name}`,
  });
  return json({ ok: true, patient: out[0] }, 201);
}

/** GET /api/patients?q= — staff search by Patient ID, phone or name (top 20). */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const roleErr = ensureRole(guard.account, ["admin", "doctor"]);
  if (roleErr) return roleErr;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return apiError("Search needs at least 3 characters.", 422);

  const db = await getDb();
  const like = `%${q.toLowerCase()}%`;
  const rows = await db
    .select({
      id: patientsT.id,
      patientCode: patientsT.patientCode,
      name: patientsT.name,
      phone: patientsT.phone,
      dob: patientsT.dob,
      gender: patientsT.gender,
    })
    .from(patientsT)
    .where(
      or(
        sql`lower(${patientsT.patientCode}) like ${like}`,
        sql`lower(${patientsT.phone}) like ${like}`,
        sql`lower(${patientsT.name}) like ${like}`
      )
    )
    .limit(20);
  return json({ patients: rows });
}
