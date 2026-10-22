/**
 * POST /api/labs — order a laboratory test atomically.
 *
 * ONE transaction: lab order row (workflow=ordered, the Laboratory Panel
 * queue) + its automatic billable item on the patient's open invoice.
 * IdempotencyKey prevents duplicated orders/charges on retries.
 *
 * GET /api/labs — role-scoped listing (staff see all, patients their own).
 */
import { getDb } from "@/db";
import { labs, patients as patientsT } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { addBillableItem } from "@/lib/server/orders";
import { eq } from "drizzle-orm";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["doctor", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{
    patientId?: string;
    doctorId?: string;
    visitId?: string;
    test?: string;
    priority?: string;
    clinicalNote?: string;
    idemKey?: string;
  }>(req);
  if (!body?.patientId || !body.test?.trim()) {
    return apiError("Patient and test name are required.", 422);
  }

  const db = await getDb();
  const patient = (await db.select().from(patientsT).where(eq(patientsT.id, body.patientId)).limit(1))[0];
  if (!patient) return apiError("Patient not found.", 404);

  const test = body.test.trim().slice(0, 160);
  const priority = ["routine", "urgent", "stat"].includes(body.priority ?? "") ? body.priority! : "routine";
  const idemKey = typeof body.idemKey === "string" && body.idemKey.length === 32 ? body.idemKey : null;

  if (idemKey) {
    const existing = (await db.select().from(labs).where(eq(labs.idemKey, idemKey)).limit(1))[0];
    if (existing) return json({ ok: true, id: existing.id, duplicate: true });
  }

  const doctorId = account.role === "doctor" ? (account.doctorId ?? "") : (body.doctorId ?? "");
  if (!doctorId) return apiError("Missing doctor.", 422);

  const labId = newId("LAB-", 6);

  try {
    await (db as any).transaction(async (tx: any) => {
      await tx.insert(labs).values({
        id: labId,
        patientId: body.patientId!,
        doctorId,
        test,
        requestedOn: new Date().toISOString().slice(0, 10),
        status: "requested",
        workflow: "ordered",
        priority,
        visitId: body.visitId || null,
        clinicalNote: (body.clinicalNote ?? "").slice(0, 500),
        idemKey,
      });
      await addBillableItem(tx as any, {
        patientId: body.patientId!,
        sourceType: "lab",
        sourceOrderId: labId,
        label: test,
        quantity: 1,
        kind: "lab",
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (idemKey && /unique|duplicate/i.test(msg)) {
      const existing = (await db.select().from(labs).where(eq(labs.idemKey, idemKey)).limit(1))[0];
      return json({ ok: true, id: existing?.id ?? labId, duplicate: true });
    }
    console.error("[labs] transaction failed:", msg);
    return apiError("The lab order could not be saved. Nothing was billed — please try again.", 500);
  }

  await recordAudit(account, {
    action: "create",
    entity: "lab-order",
    entityId: labId,
    detail: `patient=${body.patientId} test=${test} priority=${priority}`,
  });

  return json({ ok: true, id: labId }, 201);
}

export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const db = await getDb();
  if (guard.account.role === "patient") {
    const rows = await db
      .select()
      .from(labs)
      .where(eq(labs.patientId, guard.account.patientId ?? "__none__"));
    return json({ labs: rows });
  }
  const rows = await db.select().from(labs);
  return json({ labs: rows });
}
