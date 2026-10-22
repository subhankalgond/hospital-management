/**
 * GET  /api/billing — inventory + service prices + billable items (auth: doctor/admin, patients: own items via /api/state).
 * POST /api/billing — manage stock and prices (admins only):
 *   { action:"set-inventory", id?, name, unit?, unitPrice, stock, reorderLevel? }
 *   { action:"set-price", itemId, unitPrice }                    → resolves an awaiting_price item
 *   { action:"set-service-price", kind, name, unitPrice }
 *
 * Inventory and prices never leave zero-configured rows silently: a billable
 * item with no configured price stays `awaiting_price` until an admin sets
 * one. The API never invents a price.
 */
import { eq, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { inventory as inventoryT, servicePrices as servicePricesT, invoiceItems as invoiceItemsT } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { setBillableItemPrice } from "@/lib/server/orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const roleErr = ensureRole(guard.account, ["doctor", "admin", "pharmacy", "lab"]);
  if (roleErr) return roleErr;
  const db = await getDb();
  const [inv, prices, items] = await Promise.all([
    db.select().from(inventoryT).orderBy(inventoryT.name),
    db.select().from(servicePricesT).orderBy(servicePricesT.kind, servicePricesT.name),
    db.select().from(invoiceItemsT).orderBy(desc(invoiceItemsT.createdAt)).limit(200),
  ]);
  return json({ inventory: inv, prices, items });
}

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const roleErr = ensureRole(guard.account, ["admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return apiError("Invalid request body.");

  const db = await getDb();
  const now = new Date().toISOString();

  if (body.action === "set-inventory") {
    const name = String(body.name ?? "").trim().slice(0, 120);
    const unitPrice = Number(body.unitPrice ?? 0);
    const stock = Number(body.stock ?? 0);
    const unit = String(body.unit ?? "strip").slice(0, 20) || "strip";
    const reorder = Number(body.reorderLevel ?? 10);
    if (!name) return apiError("Medication name is required.", 422);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError("Unit price must be a non-negative number.", 422);
    if (!Number.isFinite(stock) || stock < 0) return apiError("Stock must be a non-negative number.", 422);

    const existing = (await db.select().from(inventoryT).where(eq(inventoryT.name, name)).limit(1))[0];
    if (existing) {
      await db
        .update(inventoryT)
        .set({ unitPrice, stock, unit, reorderLevel: reorder, updatedAt: new Date() })
        .where(eq(inventoryT.id, existing.id));
      await recordAudit(guard.account, { action: "update", entity: "inventory", entityId: existing.id, detail: `${name} stock=${stock} price=${unitPrice}` });
      return json({ ok: true, id: existing.id });
    }
    const id = newId("INV-", 4);
    await db.insert(inventoryT).values({ id, name, unit, unitPrice, stock, reorderLevel: reorder });
    await recordAudit(guard.account, { action: "create", entity: "inventory", entityId: id, detail: `${name}` });
    return json({ ok: true, id }, 201);
  }

  if (body.action === "set-service-price") {
    const kind = body.kind === "lab" ? "lab" : body.kind === "medication" ? "medication" : null;
    const name = String(body.name ?? "").trim().slice(0, 160);
    const unitPrice = Number(body.unitPrice ?? 0);
    if (!kind) return apiError("kind must be medication or lab.", 422);
    if (!name) return apiError("Service name is required.", 422);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError("Price must be a non-negative number.", 422);
    const existing = (
      await db
        .select()
        .from(servicePricesT)
        .where(sql`kind = ${kind} and lower(name) = lower(${name})`)
        .limit(1)
    )[0];
    if (existing) {
      await db.update(servicePricesT).set({ unitPrice, updatedAt: new Date() }).where(eq(servicePricesT.id, existing.id));
      return json({ ok: true, id: existing.id });
    }
    const id = newId("SP-", 4);
    await db.insert(servicePricesT).values({ id, kind, name, unitPrice });
    await recordAudit(guard.account, { action: "create", entity: "service-price", entityId: id, detail: `${kind}:${name}=${unitPrice}` });
    return json({ ok: true, id }, 201);
  }

  if (body.action === "set-price") {
    const itemId = String(body.itemId ?? "");
    const unitPrice = Number(body.unitPrice ?? NaN);
    if (!itemId) return apiError("itemId is required.", 422);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return apiError("Price must be a non-negative number.", 422);
    const ok = await setBillableItemPrice(db, itemId, unitPrice);
    if (!ok) return apiError("Billable item not found.", 404);
    await recordAudit(guard.account, { action: "update", entity: "invoice-item", entityId: itemId, detail: `price=${unitPrice}` });
    return json({ ok: true });
  }

  return apiError("Unknown billing action.", 422);
}
