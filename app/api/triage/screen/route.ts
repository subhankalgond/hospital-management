import { readJson, json, apiError, newId } from "@/lib/server/api";
import { evaluateEscalationRules, RULE_ENGINE_VERSION } from "@/lib/server/triage-rules";
import { getSessionAccount } from "@/lib/server/auth";
import { getDb } from "@/db";
import { symptomAssessments } from "@/db/schema";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/triage/screen { text, patientId? }
 *
 * Early, pre-booking symptom screening against the clinic's rule engine.
 *
 * Design constraints (clinical safety):
 * - Runs synchronously BEFORE the AI router / booking can proceed, so emergency
 *   instructions are never delayed by a model call or external API.
 * - It only ESCALATES; a "no match" result can never define a text as safe.
 * - It produces no diagnosis, no triage number, no MTS claim.
 * - Routes flagged assessments to the emergency clinical queue and logs the audit trail.
 */
export async function POST(req: Request) {
  const body = await readJson<{ text?: string; patientId?: string }>(req);
  const text = (body?.text ?? "").toString().slice(0, 4000);
  if (!text.trim()) return apiError("A non-empty `text` is required.", 422);

  const result = evaluateEscalationRules(text);
  if (!result.escalate) {
    return json({
      escalate: false,
      engineVersion: RULE_ENGINE_VERSION,
      note: "No pre-configured emergency rule matched. This screening does NOT rule out an emergency; a clinician must assess.",
      hits: [],
    });
  }

  // Record into the emergency clinical queue & audit log if patient account is available
  try {
    const account = await getSessionAccount();
    const patientId = account?.patientId || body?.patientId;
    if (account && patientId) {
      const db = await getDb();
      const saId = newId("SA-", 6);
      await db.insert(symptomAssessments).values({
        id: saId,
        patientId,
        transcript: text,
        inputMode: "text",
        extracted: { categories: result.categories },
        suggestedDepartment: "Emergency Medicine",
        alternativeDepartments: [],
        urgency: "emergency",
        urgencyNote: `Emergency Override: ${result.hits.map((h) => h.ruleId).join(", ")}`,
        followUpQuestions: [],
        engine: RULE_ENGINE_VERSION,
        reviewOutcome: null, // Awaiting clinician review
      });
      await recordAudit(account, {
        action: "create",
        entity: "emergency-triage-override",
        entityId: saId,
        detail: `Escalation hits: ${result.hits.map((h) => h.ruleId).join(", ")}`,
      });
    }
  } catch (err) {
    console.error("[triage/screen] Failed to record emergency log:", err);
  }

  return json({
    escalate: true,
    engineVersion: RULE_ENGINE_VERSION,
    hits: result.hits,
    categories: result.categories,
  });
}
