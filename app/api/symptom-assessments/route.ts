import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { symptomAssessments, doctors as doctorsT } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { analyzeSymptoms, ANALYSIS_DISCLAIMER } from "@/lib/nlp/multi";

/**
 * POST /api/symptom-assessments
 * Body: { transcript, inputMode?, patientId? }
 * - Patient accounts: patientId is forced to their own profile.
 * - Staff accounts: may pass patientId (registering on behalf), otherwise
 *   the assessment is stored unlinked to an encounter but still auditable.
 * Runs the analyzer server-side (patient text never reaches an external AI
 * provider) and persists structured output with the engine version.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const body = await readJson<{ transcript?: string; inputMode?: string; patientId?: string }>(req);
  if (!body) return apiError("Invalid JSON body", 400);

  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return apiError("transcript is required", 400);
  if (transcript.length > 2000) return apiError("transcript too long (max 2000 chars)", 400);

  const inputMode = body.inputMode === "voice" ? "voice" : "text";

  const targetPatientId =
    account.role === "patient"
      ? (account.patientId ?? null)
      : typeof body.patientId === "string" && body.patientId
        ? body.patientId
        : null;

  if (account.role === "patient" && !account.patientId) {
    return apiError("No patient profile linked to this account.", 403);
  }

  // 1. analyze (server-side only)
  const analysis = analyzeSymptoms(transcript);

  // 2. doctor recommendation — a real doctor from the DB whose specialty
  //    matches the suggested department; never invented.
  const db = await getDb();
  const candidateDocs: (typeof doctorsT.$inferSelect)[] = await db
    .select()
    .from(doctorsT)
    .where(eq(doctorsT.department, analysis.suggestedDepartment));
  const recommended =
    candidateDocs.sort(
      (a: typeof doctorsT.$inferSelect, b: typeof doctorsT.$inferSelect) =>
        b.rating - a.rating || b.experienceYears - a.experienceYears
    )[0] ?? null;

  const id = newId("SA-", 6);
  await db.insert(symptomAssessments).values({
    id,
    patientId: targetPatientId ?? "unlinked",
    doctorId: recommended?.id ?? null,
    transcript,
    inputMode,
    extracted: {
      symptoms: analysis.symptoms,
      negated: analysis.negated,
      duration: analysis.duration ?? null,
      severity: analysis.severity ?? null,
      version: analysis.version,
    },
    suggestedDepartment: analysis.suggestedDepartment,
    alternativeDepartments: analysis.alternativeDepartments,
    urgency: analysis.urgency,
    urgencyNote: analysis.urgencyReason,
    followUpQuestions: analysis.followUpQuestions,
    engine: analysis.version,
  });

  await recordAudit(account, {
    action: "create",
    entity: "symptom-assessment",
    entityId: id,
    detail: `urgency=${analysis.urgency} dept=${analysis.suggestedDepartment} patient=${targetPatientId ?? "unlinked"}`,
  });

  return json(
    {
      id,
      analysis,
      doctor: recommended
        ? {
            id: recommended.id,
            name: recommended.name,
            specialty: recommended.specialty,
            department: recommended.department,
            qualification: recommended.qualification,
            room: recommended.room,
            experienceYears: recommended.experienceYears,
          }
        : null,
      disclaimer: ANALYSIS_DISCLAIMER,
    },
    201
  );
}

/**
 * GET /api/symptom-assessments?patientId=...
 * - Patients: only their own rows.
 * - Doctors/admins: all rows, optionally filtered by patientId.
 */
export async function PATCH(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "doctor" && account.role !== "admin") {
    return apiError("Only clinicians can review assessments.", 403);
  }

  const body = await readJson<{ id?: string; outcome?: string; note?: string }>(req);
  const id = body?.id ?? "";
  const outcome = body?.outcome ?? "";
  if (!id) return apiError("Assessment id is required.", 422);
  if (!["agreed", "changed", "dismissed"].includes(outcome)) {
    return apiError("outcome must be agreed, changed or dismissed.", 422);
  }

  const db = await getDb();
  const rows = await db.select().from(symptomAssessments).where(eq(symptomAssessments.id, id)).limit(1);
  if (!rows[0]) return apiError("Assessment not found.", 404);

  await db
    .update(symptomAssessments)
    .set({
      reviewOutcome: outcome,
      reviewNote: (body?.note ?? "").toString().slice(0, 500) || null,
      reviewedBy: account.id,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(symptomAssessments.id, id));

  await recordAudit(account, {
    action: "update",
    entity: "symptom-assessment",
    entityId: id,
    detail: `review=${outcome}`,
  });

  return json({ ok: true });
}

/**
 * GET /api/symptom-assessments?patientId=...
 */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const db = await getDb();
  const url = new URL(req.url);
  const requested = url.searchParams.get("patientId");

  if (account.role === "patient") {
    const rows = await db
      .select()
      .from(symptomAssessments)
      .where(eq(symptomAssessments.patientId, account.patientId ?? "__none__"))
      .orderBy(desc(symptomAssessments.createdAt))
      .limit(50);
    return json({ assessments: rows });
  }

  if (account.role === "doctor" || account.role === "admin") {
    const rows = requested
      ? await db
          .select()
          .from(symptomAssessments)
          .where(eq(symptomAssessments.patientId, requested))
          .orderBy(desc(symptomAssessments.createdAt))
          .limit(100)
      : await db
          .select()
          .from(symptomAssessments)
          .orderBy(desc(symptomAssessments.createdAt))
          .limit(100);

    // Viewing a specific patient's assessments is audited.
    if (requested) {
      await recordAudit(account, {
        action: "view",
        entity: "symptom-assessment",
        entityId: requested,
        detail: `list row_count=${rows.length}`,
      });
    }
    return json({ assessments: rows });
  }

  return apiError("Forbidden", 403);
}
