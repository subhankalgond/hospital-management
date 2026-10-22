/**
 * PATCH /api/labs/[id] — Laboratory Panel workflow actions.
 *
 * Allowed transitions (enforced server-side, never trusted from the client):
 *   ordered → awaiting_sample → sample_collected → processing →
 *   result_ready (requires actual result values) → verified
 * plus `cancel` from any not-yet-resulted state.
 *
 * Permissions:
 *   - lab / admin: collect-sample, process, record result, verify, cancel
 *   - doctor: cancel own ordered tests; result verification allowed
 *   - patient: never
 * The legacy `status` column stays in sync so the existing admin UI keeps
 * working (requested → in-progress → resulted).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labs } from "@/db/schema";
import { json, apiError, readJson, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Action = "collect" | "process" | "result" | "verify" | "cancel";

/** Maps the new workflow stage to the legacy status column. */
function legacyStatus(workflow: string): string {
  switch (workflow) {
    case "verified":
    case "result_ready":
      return "resulted";
    case "processing":
      return "in-progress";
    default:
      return "requested";
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["lab", "admin", "doctor"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ action?: Action; result?: string; note?: string }>(req);

  const db = await getDb();
  const rows = await db.select().from(labs).where(eq(labs.id, params.id)).limit(1);
  const lab = rows[0];
  if (!lab) return apiError("Lab order not found.", 404);
  const wf = lab.workflow ?? "ordered";
  const now = new Date().toISOString();
  const who = account.id;
  const whoName = account.name;

  const patch: Record<string, string | null> = {};
  let action = body?.action ?? "";

  if (wf === "verified" || wf === "cancelled") {
    return apiError(`This order is already ${wf}.`, 409);
  }

  if (action === "collect") {
    if (wf !== "ordered" && wf !== "awaiting_sample") {
      return apiError("Sample already collected for this order.", 409);
    }
    patch.workflow = "sample_collected";
    patch.sampleCollectedAt = now;
    patch.status = legacyStatus("sample_collected");
  } else if (action === "process") {
    if (wf !== "sample_collected" && wf !== "awaiting_sample") {
      return apiError("Collect the sample before processing.", 409);
    }
    patch.workflow = "processing";
    patch.processedAt = now;
    patch.processedBy = who;
    patch.status = legacyStatus("processing");
  } else if (action === "result") {
    const result = (body?.result ?? "").trim();
    if (!result) return apiError("Actual result values are required — a test must not be marked complete without data.", 422);
    if (result.length > 4000) return apiError("Result too long (max 4000 characters).", 422);
    if (wf !== "sample_collected" && wf !== "processing") {
      return apiError("Collect and process the sample before recording results.", 409);
    }
    patch.result = result;
    patch.workflow = "result_ready";
    patch.processedAt = patch.processedAt ?? now;
    patch.processedBy = patch.processedBy ?? who;
    patch.status = legacyStatus("result_ready");
  } else if (action === "verify") {
    if (!lab.result) return apiError("A test cannot be verified without recorded results.", 409);
    if (wf !== "result_ready") return apiError("Record the result before verification.", 409);
    if (account.role !== "lab" && account.role !== "admin" && account.role !== "doctor") {
      return apiError("Not allowed.", 403);
    }
    patch.workflow = "verified";
    patch.verifiedBy = who;
    patch.verifiedByName = whoName;
    patch.verifiedAt = now;
    patch.status = legacyStatus("verified");
  } else if (action === "cancel") {
    if (account.role === "doctor" && lab.doctorId !== account.doctorId) {
      return apiError("Doctors can only cancel their own orders.", 403);
    }
    patch.workflow = "cancelled";
    patch.cancelledReason = (body?.note ?? "").slice(0, 300);
    patch.status = legacyStatus("cancelled");
  } else {
    return apiError("Unknown lab action.", 422);
  }

  await db.update(labs).set(patch).where(eq(labs.id, params.id));

  await recordAudit(account, {
    action: "update",
    entity: "lab-order",
    entityId: params.id,
    detail: `${action} workflow=${String(patch.workflow).replace(/_.*$/, "")}`.replace("workflow=" + String(patch.workflow).split("_")[0], `workflow=${patch.workflow}`),
  });

  return json({ ok: true, workflow: patch.workflow, status: patch.status });
}
