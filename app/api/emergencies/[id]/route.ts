import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emergencyCases } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import { runTriage } from "@/lib/triage";
import type { EmergencyPriority, EmergencyStatus, EmergencyVitals } from "@/lib/types";

const PRIORITIES: EmergencyPriority[] = ["CRITICAL", "URGENT", "MODERATE", "LOW"];
const STATUSES: EmergencyStatus[] = [
  "arrived", "triage-pending", "triaged", "waiting", "in-assessment",
  "in-treatment", "admitted", "transferred", "discharged", "closed",
];

async function loadCase(id: string) {
  const db = await getDb();
  const rows = await db.select().from(emergencyCases).where(eq(emergencyCases.id, id)).limit(1);
  return rows[0] ?? null;
}

/** GET /api/emergencies/[id] — full case detail (staff). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Not allowed.", 403);
  const row = await loadCase(params.id);
  if (!row) return apiError("Emergency case not found.", 404);
  return json({ case: row });
}

/**
 * PATCH /api/emergencies/[id] — triage review, status transitions, priority
 * change and doctor assignment. Triage is never auto-applied: the staff
 * member explicitly confirms the final priority.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Not allowed.", 403);

  const row = await loadCase(params.id);
  if (!row) return apiError("Emergency case not found.", 404);

  const body = await readJson<{
    action?: "triage" | "status" | "assign-doctor" | "priority" | "record-vitals";
    aiPriority?: string;
    priority?: string;
    reason?: string;
    reviewer?: string;
    status?: string;
    doctorId?: string;
    vitals?: Partial<EmergencyVitals>;
  }>(req);
  if (!body?.action) return apiError("Action is required.", 422);

  const now = new Date().toISOString();
  const db = await getDb();

  if (body.action === "triage") {
    if (!row.vitals) return apiError("Record vitals before running triage.", 409);
    const result = runTriage({
      symptoms: row.symptoms,
      vitals: row.vitals as EmergencyVitals,
      age: (row.walkIn as { age?: number } | null)?.age ?? 40,
      trauma: row.trauma,
    });
    await db
      .update(emergencyCases)
      .set({
        triage: result,
        triageAt: now,
        status: row.status === "arrived" ? "triage-pending" : row.status,
        updatedAt: now,
      })
      .where(eq(emergencyCases.id, row.id));
    return json({ ok: true, triage: result });
  }

  if (body.action === "status") {
    const status = body.status as EmergencyStatus;
    if (!STATUSES.includes(status)) return apiError("Unknown status.", 422);
    if (status === row.status) return json({ ok: true });
    await db
      .update(emergencyCases)
      .set({ status, updatedAt: now })
      .where(eq(emergencyCases.id, row.id));
    return json({ ok: true });
  }

  if (body.action === "assign-doctor") {
    if (!body.doctorId) return apiError("doctorId is required.", 422);
    await db
      .update(emergencyCases)
      .set({ assignedDoctorId: body.doctorId, updatedAt: now })
      .where(eq(emergencyCases.id, row.id));
    return json({ ok: true });
  }

  if (body.action === "priority") {
    const priority = body.priority as EmergencyPriority;
    if (!PRIORITIES.includes(priority)) return apiError("Unknown priority.", 422);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const isChange = Boolean(row.confirmedAt) && priority !== row.priority;
    if (isChange && !reason) return apiError("A reason is required when changing the priority.", 422);
    // A first confirmation that overrides the AI recommendation is also a
    // documented override — keep the reviewer's reason on record.
    const aiPriority = (row.triage as { aiPriority?: string } | null)?.aiPriority;
    const overridesAI = Boolean(aiPriority) && priority !== aiPriority;
    await db
      .update(emergencyCases)
      .set({
        priority,
        confirmedAt: row.confirmedAt ?? now,
        reviewer: guard.account.name,
        reasonForChange: (isChange || overridesAI) && reason ? reason : row.reasonForChange,
        status: row.status === "triage-pending" || row.status === "arrived" ? "triaged" : row.status,
        updatedAt: now,
      })
      .where(eq(emergencyCases.id, row.id));
    return json({ ok: true });
  }

  if (body.action === "record-vitals") {
    const v = body.vitals ?? {};
    const num = (x: unknown) => Number(x);
    const vitals: EmergencyVitals = {
      hr: num(v.hr),
      bp: typeof v.bp === "string" ? v.bp.trim() : "",
      spo2: num(v.spo2),
      rr: num(v.rr),
      tempC: num(v.tempC),
      glucose: num(v.glucose),
      consciousness: (["alert", "verbal", "pain", "unresponsive"].includes(String(v.consciousness))
        ? v.consciousness
        : "alert") as EmergencyVitals["consciousness"],
    };
    if (!Number.isFinite(vitals.hr) || vitals.hr < 0 || vitals.hr > 300) return apiError("Heart rate must be 0–300 BPM.", 422);
    if (!/^\d{2,3}\/\d{2,3}$/.test(vitals.bp)) return apiError("Blood pressure must look like 120/80.", 422);
    if (!Number.isFinite(vitals.spo2) || vitals.spo2 < 50 || vitals.spo2 > 100) return apiError("SpO₂ must be 50–100%.", 422);
    if (!Number.isFinite(vitals.rr) || vitals.rr < 0 || vitals.rr > 80) return apiError("Respiratory rate must be 0–80/min.", 422);
    if (!Number.isFinite(vitals.tempC) || vitals.tempC < 30 || vitals.tempC > 45) return apiError("Temperature must be 30–45 °C.", 422);
    if (!Number.isFinite(vitals.glucose) || vitals.glucose < 0 || vitals.glucose > 1000) return apiError("Glucose must be 0–1000 mg/dL.", 422);
    await db
      .update(emergencyCases)
      .set({ vitals, updatedAt: now })
      .where(eq(emergencyCases.id, row.id));
    return json({ ok: true });
  }

  return apiError("Unknown action.", 422);
}
