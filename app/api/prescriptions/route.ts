/**
 * POST /api/prescriptions — issue a prescription atomically.
 *
 * One request does all of this inside a single database transaction:
 *   1. save the prescription document (legacy-compatible row),
 *   2. create one medication_order per medication (the Pharmacy Panel queue),
 *   3. create one billable item per order and link it to the patient's open
 *      invoice (or `awaiting_price` when no price is configured),
 *   4. return success only after everything persisted.
 *
 * Idempotency: the client sends an `idemKey` (generated once per form open).
 * A retry with the same key returns the existing order set — no duplicates,
 * no double-billing — even across concurrent requests (unique DB index).
 */
import { getDb } from "@/db";
import { prescriptions, medicationOrders, patients as patientsT } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { addBillableItem } from "@/lib/server/orders";
import { eq, like } from "drizzle-orm";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RxItem {
  drug: string;
  dosage: string;
  route?: string;
  frequency: string;
  durationDays: number;
  quantity?: number;
  instructions?: string;
}

const ROUTES = new Set(["oral", "iv", "im", "sc", "topical", "inhaled", "sublingual", "rectal", "ocular", "other"]);

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
    idemKey?: string;
    items?: RxItem[];
  }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return apiError("A prescription needs at least one medication.", 422);
  }

  const db = await getDb();
  const patient = (await db.select().from(patientsT).where(eq(patientsT.id, body.patientId)).limit(1))[0];
  if (!patient) return apiError("Patient not found.", 404);

  // Well-formed, sanitized items.
  type SanitizedRxItem = Required<
    Pick<RxItem, "drug" | "dosage" | "route" | "frequency" | "quantity" | "durationDays">
  > &
    Pick<RxItem, "instructions">;
  const items: SanitizedRxItem[] = [];
  for (const it of body.items) {
    const drug = (it?.drug ?? "").toString().trim().slice(0, 120);
    if (!drug) continue;
    const route = ROUTES.has((it.route ?? "").toString()) ? (it.route as string) : "oral";
    items.push({
      drug,
      dosage: (it.dosage ?? "").toString().slice(0, 60),
      route,
      frequency: (it.frequency ?? "").toString().slice(0, 60),
      durationDays: Number.isFinite(Number(it.durationDays)) ? Math.max(0, Number(it.durationDays)) : 0,
      quantity: Number.isFinite(Number(it.quantity)) ? Math.max(1, Math.min(365, Number(it.quantity) || 1)) : 1,
      instructions: (it.instructions ?? "").toString().slice(0, 300) || undefined,
    });
  }
  if (items.length === 0) return apiError("A prescription needs at least one medication.", 422);

  const doctorId = account.role === "doctor" ? (account.doctorId ?? "") : (body.doctorId ?? "");
  if (!doctorId) return apiError("Missing doctor.", 422);

  const idemKey = typeof body.idemKey === "string" && body.idemKey.length === 32 ? body.idemKey : null;

  /* Idempotency: an identical key returns the orders already created. */
  if (idemKey) {
    // Stored keys are `${idemKey}:${index}` per medication — match the family.
    const existing = await db
      .select()
      .from(medicationOrders)
      .where(like(medicationOrders.idemKey, `${idemKey}:%`))
      .limit(1);
    if (existing[0]) {
      const ids = await db.select().from(medicationOrders).where(eq(medicationOrders.prescriptionId, existing[0].prescriptionId));
      return json({
        ok: true,
        id: existing[0].prescriptionId,
        orderId: ids[0]?.id ?? existing[0].id,
        orderIds: ids.map((o: any) => o.id),
        duplicate: true,
      });
    }
  }

  const rxId = newId("RX-", 6);
  const orderIds: string[] = [];

  try {
    await (db as any).transaction(async (tx: any) => {
      await tx.insert(prescriptions).values({
        id: rxId,
        patientId: body.patientId!,
        doctorId,
        date: new Date().toISOString().slice(0, 10),
        items: items.map(({ route, quantity, ...rest }) => ({ ...rest, route, quantity })),
        active: true,
      });

      for (const it of items) {
        const orderId = newId("MO-", 6);
        const key = idemKey ? `${idemKey}:${orderIds.length}` : null;
        await tx.insert(medicationOrders).values({
          id: orderId,
          patientId: body.patientId!,
          doctorId,
          visitId: body.visitId || null,
          prescriptionId: rxId,
          drug: it.drug,
          dosage: it.dosage,
          route: it.route,
          frequency: it.frequency,
          durationDays: it.durationDays,
          quantity: it.quantity ?? 1,
          instructions: it.instructions ?? "",
          status: "pending_review",
          idemKey: key,
        });
        orderIds.push(orderId);
        // Billable item in the SAME transaction — the order cannot exist
        // without its charge, and vice versa.
        await addBillableItem(tx as any, {
          patientId: body.patientId!,
          sourceType: "medication",
          sourceOrderId: orderId,
          label: it.drug,
          quantity: it.quantity ?? 1,
          kind: "medication",
        });
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Unique index hit on concurrency retry with the same key = benign.
    if (idemKey && /unique|duplicate/i.test(msg)) {
      return json({ ok: true, id: rxId, duplicate: true });
    }
    console.error("[prescriptions] transaction failed:", msg);
    return apiError("The prescription could not be saved. Nothing was billed — please try again.", 500);
  }

  await recordAudit(account, {
    action: "create",
    entity: "prescription",
    entityId: rxId,
    detail: `patient=${body.patientId} orders=${orderIds.join(",")}`,
  });

  return json({ ok: true, id: rxId, orderId: orderIds[0], orderIds }, 201);
}
