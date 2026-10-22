/**
 * PATCH /api/pharmacy/[id] — Pharmacy Panel workflow.
 *
 * Workflow: pending_review → verified → (dispensing) → dispensed
 * with clarification_required / on_hold / cancelled side-states.
 *
 * Rules enforced server-side:
 * - Only pharmacists (role `pharmacy`) and admins may act.
 * - Dispense requires verification first — a doctor submitting an order never
 *   marks it dispensed.
 * - No duplicate dispensing: `dispensed` is terminal.
 * - Stock is checked and decremented inside the same transaction when the
 *   medication exists in inventory. When no stock record exists the dispense
 *   is allowed but never claims stock (nothing is invented).
 * - Cancelling an order also cancels its billable item.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { medicationOrders, inventory as inventoryT, patients as patientsT } from "@/db/schema";
import { json, apiError, readJson, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { cancelBillableItem } from "@/lib/server/orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Action = "verify" | "dispense" | "hold" | "clarify" | "cancel";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["pharmacy", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ action?: Action; note?: string }>(req);
  const action = body?.action ?? "";
  const note = (body?.note ?? "").toString().slice(0, 300);

  const db = await getDb();
  const rows = await db.select().from(medicationOrders).where(eq(medicationOrders.id, params.id)).limit(1);
  const order = rows[0];
  if (!order) return apiError("Medication order not found.", 404);

  const now = new Date().toISOString();

  if (order.status === "dispensed") return apiError("This order is already dispensed.", 409);
  if (order.status === "cancelled") return apiError("This order was cancelled.", 409);

  try {
    await (db as any).transaction(async (tx: any) => {
      if (action === "verify") {
        if (order.status !== "pending_review") {
          throw Object.assign(new Error("Only pending-review orders can be verified."), { status: 409 });
        }
        await tx
          .update(medicationOrders)
          .set({
            status: "verified",
            verifiedBy: account.id,
            verifiedByName: account.name,
            verifiedAt: now,
            updatedAt: new Date(),
          })
          .where(eq(medicationOrders.id, params.id));
      } else if (action === "dispense") {
        if (order.status !== "verified") {
          throw Object.assign(new Error("A pharmacist must verify the prescription before dispensing."), { status: 409 });
        }
        // Inventory check + decrement in the same transaction.
        const stockRows = await tx
          .select()
          .from(inventoryT)
          .where(eq(inventoryT.name, order.drug))
          .limit(1);
        const stock = stockRows[0];
        let stockNote = "";
        if (stock) {
          if (stock.stock <= 0) {
            throw Object.assign(
              new Error(`Out of stock: ${order.drug} (0 ${stock.unit} available). Recreate stock before dispensing.`),
              { status: 409 }
            );
          }
          const qty = Math.max(1, order.quantity || 1);
          await tx
            .update(inventoryT)
            .set({ stock: stock.stock - qty, updatedAt: new Date() })
            .where(eq(inventoryT.id, stock.id));
          stockNote = `stock ${stock.stock - qty} ${stock.unit}`;
        }
        await tx
          .update(medicationOrders)
          .set({
            status: "dispensed",
            dispensedBy: account.id,
            dispensedByName: account.name,
            dispensedAt: now,
            updatedAt: new Date(),
            noteFromPharmacy: note,
          })
          .where(eq(medicationOrders.id, params.id));
        await recordAudit(account, {
          action: "update",
          entity: "medication-order",
          entityId: params.id,
          detail: `dispensed ${stockNote}`,
        });
      } else if (action === "hold") {
        if (order.status === "verified" || order.status === "dispensing") {
          throw Object.assign(new Error("Verified orders cannot be held — cancel instead if needed."), { status: 409 });
        }
        await tx
          .update(medicationOrders)
          .set({ status: "on_hold", noteFromPharmacy: note, updatedAt: now })
          .where(eq(medicationOrders.id, params.id));
      } else if (action === "clarify") {
        if (order.status !== "pending_review" && order.status !== "on_hold") {
          throw Object.assign(new Error("Only pending orders can be sent for clarification."), { status: 409 });
        }
        await tx
          .update(medicationOrders)
          .set({ status: "clarification_required", noteFromPharmacy: note, updatedAt: now })
          .where(eq(medicationOrders.id, params.id));
      } else if (action === "cancel") {
        await tx
          .update(medicationOrders)
          .set({ status: "cancelled", noteFromPharmacy: note, updatedAt: now })
          .where(eq(medicationOrders.id, params.id));
      } else {
        throw Object.assign(new Error("Unknown pharmacy action."), { status: 422 });
      }

      if (action === "cancel") {
        await cancelBillableItem(tx as any, "medication", params.id);
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 500) console.error("[pharmacy] transaction failed:", msg);
    return apiError(msg, status);
  }

  return json({ ok: true });
}

/** GET /api/pharmacy/[id] — queue + patients context for the panel. */
export async function GET(_: Request, { params }: { params: { id?: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (!ensureRole(guard.account, ["pharmacy", "admin"])) {
    const db = await getDb();
    const rows = await db.select().from(medicationOrders).where(eq(medicationOrders.prescriptionId, params.id ?? ""));
    return json({ orders: rows });
  }
  return json({ orders: [] });
}
