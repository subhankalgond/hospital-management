import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { patients as patientsT, medicationOrders } from "@/db/schema";
import { json, apiError, readJson, requireAccount, ensureRole } from "@/lib/server/api";
import { runClinicalChecks } from "@/lib/server/clinical-checks";

export const dynamic = "force-dynamic";

interface CheckItem {
  drug?: string;
}

/**
 * POST /api/clinical/checks { patientId, items: [{drug}] }
 *
 * Pre-submission safety check for the e-prescription module. Doctors call this
 * BEFORE saving; the result is advisory and must be reviewed by a clinician.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["doctor", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ patientId?: string; items?: CheckItem[] }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return apiError("At least one medication is required.", 422);
  }
  const items = body.items
    .map((i) => ({ drug: (i?.drug ?? "").toString().trim().slice(0, 120) }))
    .filter((i) => i.drug);
  if (items.length === 0) return apiError("No valid medication names were provided.", 422);

  const db = await getDb();
  const patient = (await db.select().from(patientsT).where(eq(patientsT.id, body.patientId)).limit(1))[0];
  if (!patient) return apiError("Patient not found.", 404);

  // Active orders for duplicate-therapy detection.
  const activeOrders = await db
    .select()
    .from(medicationOrders)
    .where(
      and(
        eq(medicationOrders.patientId, body.patientId),
        sql`status in ('pending_review','verified','dispensing')`
      )
    )
    .limit(100);

  const result = await runClinicalChecks(items, patient, activeOrders);
  return json(result);
}
