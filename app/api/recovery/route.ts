import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/db";
import { recoveryPlans, recoveryLogs, admissions } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import type { SessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

interface PlanInstruction {
  text: string;
  kind: "instruction" | "task" | "measurement";
  cadence?: string;
}

function canManage(account: SessionAccount): boolean {
  return account.role === "doctor" || account.role === "admin";
}

/**
 * GET /api/recovery?patientId=…           → latest plan + logs (patient = own data only)
 * GET /api/recovery                       → patient: own plan + logs
 *
 * No plan is ever synthesized: if the patient has no discharge record there
 * is nothing to track, and the response says so.
 */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const db = await getDb();

  const url = new URL(req.url);
  const requested = url.searchParams.get("patientId") ?? "";
  // Patients are locked to their own Patient ID — no cross-patient access.
  const patientId = account.role === "patient" ? account.patientId ?? "" : requested;
  if (!patientId) return apiError("patientId is required.", 422);
  if (account.role === "patient" && requested && requested !== account.patientId) {
    return apiError("You can only access your own recovery data.", 403);
  }

  const [planRows, logRows] = await Promise.all([
    db
      .select()
      .from(recoveryPlans)
      .where(eq(recoveryPlans.patientId, patientId))
      .orderBy(desc(recoveryPlans.createdAt))
      .limit(1),
    db
      .select()
      .from(recoveryLogs)
      .where(eq(recoveryLogs.patientId, patientId))
      .orderBy(desc(recoveryLogs.createdAt))
      .limit(200),
  ]);

  const discharged = await db
    .select()
    .from(admissions)
    .where(and(eq(admissions.patientId, patientId), eq(admissions.status, "discharged")))
    .orderBy(desc(admissions.dischargedAt))
    .limit(5);

  return json({
    plan: planRows[0] ?? null,
    logs: logRows,
    /** admissible discharge linkage is verified server-side */
    discharges: discharged,
    hasAuthorizedDischarge: discharged.length > 0,
  });
}

/**
 * POST /api/recovery — clinician creates/updates the recovery plan.
 * Body: { patientId, admissionId?, instructions, redFlags }
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (!canManage(account)) return apiError("Only clinicians can author recovery plans.", 403);

  const body = await readJson<{
    patientId?: string;
    admissionId?: string;
    instructions?: PlanInstruction[];
    redFlags?: string[];
  }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);

  const db = await getDb();

  // The recovery plan must attach to a REAL authorized discharge record.
  if (!body.admissionId) return apiError("admissionId of a discharge record is required.", 422);
  const admRows = (await db.select().from(admissions).where(eq(admissions.patientId, body.patientId)).limit(20)) as any[];
  const admission = admRows.find((a) => a.id === body.admissionId);
  if (!admission || admission.status !== "discharged") {
    return apiError("No authorized discharge record found for this admission — the tracker requires a real discharge.", 422);
  }

  const instructions = (body.instructions ?? [])
    .filter((i) => (i?.text ?? "").trim())
    .slice(0, 30)
    .map((i) => ({
      text: i.text.toString().slice(0, 500),
      kind: ["instruction", "task", "measurement"].includes(i.kind) ? i.kind : "instruction",
      cadence: (i.cadence ?? "").toString().slice(0, 60),
    }));

  const existing = await db.select().from(recoveryPlans).where(eq(recoveryPlans.admissionId, admission.id)).limit(1);
  const now = new Date();

  if (existing[0]) {
    const updated = await db
      .update(recoveryPlans)
      .set({
        instructions,
        redFlags: (body.redFlags ?? []).slice(0, 10).map((r) => r.toString().slice(0, 200)),
        version: existing[0].version + 1,
        updatedAt: now,
      })
      .where(eq(recoveryPlans.id, existing[0].id))
      .returning();
    const rows: any[] = Array.isArray(updated) ? updated : (updated as any)?.rows ?? [];
    return json({ ok: true, plan: rows[0], amended: true });
  }

  const rows = await db
    .insert(recoveryPlans)
    .values({
      id: newId("RP-", 6),
      patientId: body.patientId,
      admissionId: admission.id,
      dischargeAt: admission.dischargedAt ?? admission.admittedAt,
      instructions,
      redFlags: (body.redFlags ?? []).slice(0, 10).map((r) => r.toString().slice(0, 200)),
      version: 1,
      createdById: account.id,
      createdByName: account.name,
    })
    .returning();
  const out: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return json({ ok: true, plan: out[0] }, 201);
}

/**
 * PATCH /api/recovery — patient records progress against their own plan.
 * Body: { type, content, metricName?, metricValue? }
 * Client-sent medical advice or measurements are only accepted if the plan
 * requests that metric — nothing is invented.
 */
export async function PATCH(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const body = await readJson<{ patientId?: string; type?: string; content?: string; metricName?: string; metricValue?: string }>(req);
  const patientId = account.role === "patient" ? account.patientId ?? "" : body?.patientId ?? "";
  if (!patientId) return apiError("Missing patient.", 422);
  if (account.role === "patient" && body?.patientId && body.patientId !== account.patientId) {
    return apiError("You can only log your own recovery data.", 403);
  }

  const type = body?.type ?? "";
  if (!["progress", "symptom", "measurement", "task_done"].includes(type)) {
    return apiError("Invalid progress type.", 422);
  }

  const db = await getDb();
  const planRows = await db
    .select()
    .from(recoveryPlans)
    .where(eq(recoveryPlans.patientId, patientId))
    .orderBy(desc(recoveryPlans.createdAt))
    .limit(1);
  const plan = planRows[0];
  if (!plan) return apiError("No recovery plan exists yet — recording requires a clinician-authored plan.", 409);

  // Measurements are accepted only when the plan asks for that metric name,
  // so tracker entries can't fabricate clinical data.
  const metricName = (body?.metricName ?? "").toString().slice(0, 60);
  if (type === "measurement") {
    const wanted = new Set(
      ((plan.instructions ?? []) as PlanInstruction[])
        .filter((i) => i.kind === "measurement")
        .map((i) => i.text.trim().toLowerCase())
    );
    if (!wanted.has(metricName.trim().toLowerCase())) {
      return apiError(`This plan does not ask for "${metricName}". Measurements can only be recorded for plan metrics.`, 422);
    }
  }

  // Server-side red-flag evaluation so flags are auditable.
  const text = type === "measurement" ? `${metricName} ${body?.metricValue ?? ""}` : (body?.content ?? "");
  const { evaluateEscalationRules } = await import("@/lib/server/triage-rules");
  const flags = (plan.redFlags ?? [])
    .filter((f: string) => f && text.toLowerCase().includes(f.toLowerCase()))
    .map((f: string) => f);
  const engine = evaluateEscalationRules(type === "symptom" ? text : "");

  const rows = await db
    .insert(recoveryLogs)
    .values({
      id: newId("RL-", 6),
      planId: plan.id,
      patientId,
      type,
      content: (body?.content ?? "").toString().slice(0, 2000),
      metricName,
      metricValue: (body?.metricValue ?? "").toString().slice(0, 60),
      flags: engine.escalate
        ? [{ source: "triage-rule-engine", hits: engine.hits.map((h) => h.ruleId) }, ...flags.map((f: string) => ({ source: "plan-red-flag", flag: f }))]
        : flags.map((f: string) => ({ source: "plan-red-flag", flag: f })),
    })
    .returning();
  const out: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return json({ ok: true, log: out[0], flagged: engine.escalate || flags.length > 0 }, 201);
}
