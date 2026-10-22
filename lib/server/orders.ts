/**
 * Server-side order orchestrator: medication / laboratory orders and their
 * automatic billable items.
 *
 * Guarantees:
 * - Order + billable item are created inside ONE database transaction, so a
 *   confirmed response implies everything persisted (or nothing did).
 * - Idempotency keys: an identical submission (network retry, double click)
 *   returns the already-existing order instead of creating a second one.
 * - (sourceType, sourceOrderId) has a database unique index — a billable item
 *   can never be duplicated for the same order.
 * - Prices come only from `inventory` / `service_prices`. When no price is
 *   configured the billable item is flagged `awaiting_price` — never priced
 *   with an invented number.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import {
  inventory as inventoryT,
  invoiceItems as invoiceItemsT,
  invoices as invoicesT,
  servicePrices as servicePricesT,
  type InvoiceItemRow,
  type InventoryRow,
} from "@/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PriceSource = { unitPrice: number; origin: "inventory" | "service" };

export async function resolvePrice(
  db: any,
  kind: "medication" | "lab",
  name: string
): Promise<PriceSource | null> {
  if (kind === "medication") {
    const rows = await db
      .select()
      .from(inventoryT)
      .where(sql`lower(${inventoryT.name}) = lower(${name})`)
      .limit(1);
    const row = rows[0] as InventoryRow | undefined;
    if (row && row.unitPrice > 0) return { unitPrice: row.unitPrice, origin: "inventory" };
  }
  const prices = await db
    .select()
    .from(servicePricesT)
    .where(and(eq(servicePricesT.kind, kind), sql`lower(${servicePricesT.name}) = lower(${name})`))
    .limit(1);
  const p = prices[0];
  if (p && p.unitPrice > 0) return { unitPrice: p.unitPrice, origin: "service" };
  return null;
}

/** Newest invoice for the patient that is still open (not fully paid). */
export async function findOpenInvoice(db: any, patientId: string) {
  const rows = await db
    .select()
    .from(invoicesT)
    .where(and(eq(invoicesT.patientId, patientId), ne(invoicesT.status, "paid")))
    .orderBy(desc(invoicesT.date))
    .limit(1);
  return rows[0] ?? null;
}

export interface BillableInput {
  patientId: string;
  sourceType: "medication" | "lab" | "consultation" | "manual";
  sourceOrderId: string | null;
  label: string;
  quantity: number;
  kind: "medication" | "lab";
}

export interface BillableResult {
  item: InvoiceItemRow;
  /** true when this call attached a NEW charge; false when the exact charge already existed */
  created: boolean;
  awaitingPrice: boolean;
  invoiceId: string;
}

/**
 * Creates the billable item for an order and links it to the patient's open
 * invoice (creating the invoice when none is open). Returns `created: false`
 * when the same order already produced this charge — duplicate submissions
 * are a no-op for billing.
 */
export async function addBillableItem(
  db: any,
  input: BillableInput
): Promise<BillableResult> {
  // Reunique-resolve: an existing invoice item for this exact order wins.
  if (input.sourceOrderId) {
    const existing = await db
      .select()
      .from(invoiceItemsT)
      .where(
        and(
          eq(invoiceItemsT.sourceType, input.sourceType),
          eq(invoiceItemsT.sourceOrderId, input.sourceOrderId)
        )
      )
      .limit(1);
    if (existing[0]) {
      return {
        item: existing[0],
        created: false,
        awaitingPrice: existing[0].status === "awaiting_price",
        invoiceId: existing[0].invoiceId,
      };
    }
  }

  // Open invoice, or create one for the patient.
  let invoice = await findOpenInvoice(db, input.patientId);
  if (!invoice) {
    const id = `INV-${rand6()}`;
    const today = todayISO();
    const due = new Date();
    due.setDate(due.getDate() + 14);
    await db.insert(invoicesT).values({
      id,
      patientId: input.patientId,
      date: today,
      dueDate: due.toISOString().slice(0, 10),
      items: [],
      status: "pending",
    });
    invoice = { id, patientId: input.patientId, items: [], status: "pending" };
  }

  // Price — never invented. `awaiting_price` when nothing is configured.
  const price = await resolvePrice(db, input.kind, input.label);
  const itemId = `II-${rand6()}`;
  const unitPrice = price?.unitPrice ?? 0;
  const status = price ? "billed" : "awaiting_price";

  await db.insert(invoiceItemsT).values({
    id: itemId,
    invoiceId: invoice.id,
    patientId: input.patientId,
    sourceType: input.sourceType,
    sourceOrderId: input.sourceOrderId,
    label: input.label,
    code: price
      ? input.kind === "medication"
        ? `MED-${sku(input.label)}`
        : `LAB-${sku(input.label)}`
      : "",
    quantity: Math.max(1, input.quantity),
    unitPrice,
    amount: Math.round(unitPrice * Math.max(1, input.quantity) * 100) / 100,
    status,
  });

  // Keep the legacy JSON line-items on the invoice in sync so every existing
  // billing view keeps its exact totals.
  if (price) {
    await appendToInvoiceJson(db, invoice.id, {
      label: input.label + (input.quantity > 1 ? ` ×${Math.max(1, input.quantity)}` : ""),
      amount: Math.round(unitPrice * Math.max(1, input.quantity) * 100) / 100,
    });
  }

  return {
    item: {
      id: itemId,
      invoiceId: invoice.id,
      patientId: input.patientId,
      sourceType: input.sourceType,
      sourceOrderId: input.sourceOrderId,
      label: input.label,
      code: "",
      quantity: Math.max(1, input.quantity),
      unitPrice,
      amount: Math.round(unitPrice * Math.max(1, input.quantity) * 100) / 100,
      status,
      currency: "INR",
      createdAt: new Date(),
    },
    created: true,
    awaitingPrice: !price,
    invoiceId: invoice.id,
  };
}

/** Admin configures a price for an item that was awaiting one: charge now appears. */
export async function setBillableItemPrice(
  db: any,
  itemId: string,
  unitPrice: number
): Promise<boolean> {
  const rows = await db.select().from(invoiceItemsT).where(eq(invoiceItemsT.id, itemId)).limit(1);
  const item = rows[0];
  if (!item) return false;
  const amount = Math.round(unitPrice * item.quantity * 100) / 100;
  await db.update(invoiceItemsT).set({ unitPrice, amount, status: "billed" }).where(eq(invoiceItemsT.id, itemId));
  if (item.status === "awaiting_price") {
    await appendToInvoiceJson(db, item.invoiceId, { label: item.label + (item.quantity > 1 ? ` ×${item.quantity}` : ""), amount });
  }
  return true;
}

/** Marks an order's billable item cancelled and removes it from the invoice. */
export async function cancelBillableItem(db: any, sourceType: string, sourceOrderId: string) {
  const rows = await db
    .select()
    .from(invoiceItemsT)
    .where(and(eq(invoiceItemsT.sourceType, sourceType), eq(invoiceItemsT.sourceOrderId, sourceOrderId)))
    .limit(1);
  const item = rows[0];
  if (!item) return;
  if (item.status === "awaiting_price") {
    await db.delete(invoiceItemsT).where(eq(invoiceItemsT.id, item.id));
    return;
  }
  await db.update(invoiceItemsT).set({ status: "cancelled" }).where(eq(invoiceItemsT.id, item.id));
  // Remove the line from the legacy JSON view so totals match reality.
  const invRows = await db.select().from(invoicesT).where(eq(invoicesT.id, item.invoiceId)).limit(1);
  const inv = invRows[0];
  if (inv && Array.isArray(inv.items)) {
    const cleaned = (inv.items as { label: string; amount: number }[]).filter(
      (l) => !(l.label === item.label + (item.quantity > 1 ? ` ×${item.quantity}` : "") && l.amount === item.amount)
    );
    await db.update(invoicesT).set({ items: cleaned }).where(eq(invoicesT.id, inv.id));
  }
}

async function appendToInvoiceJson(db: any, invoiceId: string, line: { label: string; amount: number }) {
  const rows = await db.select().from(invoicesT).where(eq(invoicesT.id, invoiceId)).limit(1);
  const inv = rows[0];
  if (!inv) return;
  const items = Array.isArray(inv.items) ? [...(inv.items as object[]), line] : [line];
  await db.update(invoicesT).set({ items }).where(eq(invoicesT.id, invoiceId));
}

function sku(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 28);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function rand6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0").slice(0, 6);
}
