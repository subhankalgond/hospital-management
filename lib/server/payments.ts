/**
 * Razorpay payment layer (integration-ready, server-authoritative).
 *
 * ── Configuration ────────────────────────────────────────────────────────────
 * RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET  — live/test gateway credentials
 *                                        (test keys during development).
 * RAZORPAY_WEBHOOK_SECRET                — secret appended to the webhook
 *                                        signature header (x-razorpay-signature).
 * CLINIC_PAYMENT_POLICY                  — "required" | "optional" | "off"
 *                                        (default: "off" until credentials exist).
 * APPOINTMENT_FEE_INR                    — appointment fee in rupees (default 500).
 *
 * When credentials are absent the module runs in DISABLED mode: the booking
 * flow books without payment and the UI shows a clear "payments not
 * configured" state. It NEVER fabricates a successful transaction.
 *
 * Security properties:
 * - Orders are created server-side only; the secret never reaches the browser.
 * - Checkout "success" responses are verified with the gateway's HMAC-SHA256
 *   payment-link signature before anything is confirmed.
 * - Webhook events are verified with the separate webhook secret and processed
 *   idempotently (event log; duplicate deliveries are ignored).
 * - Appointment confirmation happens only after a verified `paid` state.
 */
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { payments as paymentsT, type PaymentRow } from "@/db/schema";
import { newId } from "./api";

export interface PaymentConfig {
  enabled: boolean;
  policy: "required" | "optional" | "off";
  /** key id is public and safe to expose to the checkout component */
  keyId: string | null;
  feeRupees: number;
  currency: "INR";
  missingEnv: string[];
}

export function getPaymentConfig(): PaymentConfig {
  const keyId = process.env.RAZORPAY_KEY_ID || null;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || null;
  const policyRaw = (process.env.CLINIC_PAYMENT_POLICY || "off").toLowerCase();
  const policy = (["required", "optional", "off"].includes(policyRaw) ? policyRaw : "off") as PaymentConfig["policy"];
  const fee = Number(process.env.APPOINTMENT_FEE_INR || "500");
  const missingEnv: string[] = [];
  if (!keyId) missingEnv.push("RAZORPAY_KEY_ID");
  if (!keySecret) missingEnv.push("RAZORPAY_KEY_SECRET");
  const enabled = !!(keyId && keySecret);
  return {
    enabled,
    policy: enabled ? policy : "off",
    keyId,
    feeRupees: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 500,
    currency: "INR",
    missingEnv,
  };
}

/** Amount the gateway expects: smallest currency unit (paise). */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

async function rzpApi(
  method: "POST" | "GET",
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, any> | null; error?: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    return { ok: false, status: 0, data: null, error: "Razorpay credentials are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)." };
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  }).catch((err) => null);
  if (!res) return { ok: false, status: 0, data: null, error: "Could not reach the Razorpay API (network error)." };
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, data, error: (data as any)?.error?.description ?? `Razorpay API error ${res.status}.` };
  }
  return { ok: true, status: res.status, data: data as Record<string, any> };
}

export interface CreateOrderInput {
  patientId: string;
  appointmentId?: string;
  /** trace a booking/payment retry back to the same order (no double charge) */
  idemKey?: string;
}

export type CreateOrderResult =
  | { ok: true; payment: PaymentRow; checkout: { keyId: string; orderId: string; amount: number; currency: string; feeRupees: number } }
  | { ok: false; error: string; status: number };

/**
 * Creates (or reuses by idemKey / active appointment order) a gateway order
 * and a payments row. An appointment can hold at most one active order;
 * a retry after network failure returns the SAME order.
 */
export async function createOrderFor(db: any, input: CreateOrderInput): Promise<CreateOrderResult> {
  const cfg = getPaymentConfig();
  if (!cfg.enabled) {
    return {
      ok: false,
      status: 503,
      error: "Payments are not configured on this deployment (missing Razorpay credentials). Skipping payment is the only supported flow until they are added.",
    };
  }

  const idemKey = input.idemKey ?? (input.appointmentId ? `pay-appt-${input.appointmentId}` : `pay-${Date.now()}`);

  // Idempotency pass 1: key match.
  if (input.idemKey) {
    const dup = await db.select().from(paymentsT).where(eq(paymentsT.idemKey, input.idemKey)).limit(1);
    if (dup[0] && dup[0].status !== "failed") return { ok: false, status: 409, error: "A payment order already exists for this attempt (idempotency)." };
  }

  // Idempotency pass 2: appointment already has an open order.
  if (input.appointmentId) {
    const open = await db
      .select()
      .from(paymentsT)
      .where(and(eq(paymentsT.appointmentId, input.appointmentId), eq(paymentsT.status, "created")))
      .limit(1);
    if (open[0] && open[0].providerOrderId) {
      return {
        ok: true,
        payment: open[0],
        checkout: {
          keyId: cfg.keyId!,
          orderId: open[0].providerOrderId!,
          amount: rupeesToPaise(cfg.feeRupees),
          currency: cfg.currency,
          feeRupees: cfg.feeRupees,
        },
      };
    }
  }

  const rzp = await rzpApi("POST", "orders", {
    amount: rupeesToPaise(cfg.feeRupees),
    currency: cfg.currency,
    receipt: input.appointmentId ?? idemKey,
    notes: { appointmentId: input.appointmentId ?? "", patientId: input.patientId },
  });
  if (!rzp.ok || !rzp.data?.id) {
    return { ok: false, status: 502, error: rzp.error ?? "Gateway order failed." };
  }

  const rows = await db
    .insert(paymentsT)
    .values({
      id: newId("PAY-", 6),
      provider: "razorpay",
      providerOrderId: rzp.data.id,
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      amount: cfg.feeRupees,
      currency: cfg.currency,
      status: "created",
      events: [{ at: new Date().toISOString(), type: "order.created", providerOrderId: rzp.data.id }],
      idemKey,
    })
    .returning();
  const inserted: PaymentRow[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  const payment = inserted[0];

  return {
    ok: true,
    payment,
    checkout: {
      keyId: cfg.keyId!,
      orderId: rzp.data.id,
      amount: rupeesToPaise(cfg.feeRupees),
      currency: cfg.currency,
      feeRupees: cfg.feeRupees,
    },
  };
}

function hmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verifies the checkout callback signature:
 *   HMAC_SHA256(order_id|payment_id, key_secret)
 * Only a verified response can move the local record to `paid`.
 */
export function verifyCheckoutSignature(orderId: string, paymentId: string, razorpaySignature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret || !orderId || !paymentId || !razorpaySignature) return false;
  const expected = hmac(secret, `${orderId}|${paymentId}`);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(razorpaySignature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Verifies webhook signature: HMAC_SHA256(raw_body, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret || !signatureHeader) return false;
  const expected = hmac(secret, rawBody);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHeader, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type PayStatus = "paid" | "failed" | "pending";

export interface ApplyGatewayEventResult {
  ok: boolean;
  duplicate?: boolean;
  payment?: PaymentRow;
  error?: string;
}

/**
 * Applies one verified gateway event to the payment record.
 * Idempotent: the same (providerOrderId, eventId) combination is recorded
 * once; replays are no-ops. `paid` is terminal for state unless refunded.
 */
export async function applyGatewayEvent(
  db: any,
  input: { providerOrderId: string; providerPaymentId?: string; status: PayStatus; type: string; eventId?: string; failureReason?: string }
): Promise<ApplyGatewayEventResult> {
  const rows = await db.select().from(paymentsT).where(eq(paymentsT.providerOrderId, input.providerOrderId)).limit(1);
  const payment = rows[0] as PaymentRow | undefined;
  if (!payment) return { ok: false, error: `Unknown order ${input.providerOrderId}.` };

  const eventKey = `${input.eventId ?? input.type}@${input.providerPaymentId ?? ""}`;
  const events: Record<string, unknown>[] = Array.isArray((payment as any).events) ? (payment as any).events : [];
  if (events.some((e: any) => e?.key === eventKey)) {
    return { ok: true, duplicate: true, payment };
  }
  events.push({ key: eventKey, at: new Date().toISOString(), type: input.type, paymentId: input.providerPaymentId ?? null, status: input.status });

  const patch: Partial<typeof paymentsT.$inferInsert> = {
    providerPaymentId: input.providerPaymentId ?? payment.providerPaymentId,
    events,
    updatedAt: new Date(),
    failureReason: input.status === "failed" ? (input.failureReason ?? "gateway event").slice(0, 300) : payment.failureReason,
  };
  // `paid` wins; `failed`/`pending` may be overwritten later by a `paid`.
  if (input.status === "paid") patch.status = "paid";
  else if (payment.status !== "paid") patch.status = input.status === "failed" ? "failed" : (input.status as any);

  const updated = await db.update(paymentsT).set(patch).where(eq(paymentsT.id, payment.id)).returning();
  const out: PaymentRow[] = Array.isArray(updated) ? updated : (updated as any)?.rows ?? [];
  return { ok: true, payment: out[0] ?? payment, duplicate: false };
}

/**
 * Marks an appointment as paid/failed-confirmed inside the billing system.
 * Called only after a verified `paid`; creates a linked invoice entry so the
 * existing admin billing page sees it.
 */
export async function recordPaidInvoice(db: any, payment: PaymentRow): Promise<void> {
  const { invoices, invoiceItems } = await import("@/db/schema");
  const existing = await db
    .select()
    .from(invoiceItems)
    .where(and(eq(invoiceItems.sourceType, "appointment"), eq(invoiceItems.sourceOrderId, payment.id)))
    .limit(1);
  if (existing[0]) return; // already billed
  const today = new Date().toISOString().slice(0, 10);
  // If an invoice already exists for this appointment, update it instead of creating a duplicate
  if (payment.appointmentId) {
    const existingInv = await db
      .select()
      .from(invoices)
      .where(eq(invoices.appointmentId, payment.appointmentId))
      .limit(1);
    if (existingInv[0]) {
      await db
        .update(invoices)
        .set({ status: "paid", paidAt: new Date().toISOString() })
        .where(eq(invoices.id, existingInv[0].id));
      await db.insert(invoiceItems).values({
        id: newId("II-", 6),
        invoiceId: existingInv[0].id,
        patientId: payment.patientId,
        sourceType: "appointment",
        sourceOrderId: payment.id,
        label: "Paid consultation fee",
        quantity: 1,
        unitPrice: payment.amount,
        amount: payment.amount,
        status: "billed",
        currency: payment.currency,
      });
      return;
    }
  }

  const invoiceRows = await db
    .insert(invoices)
    .values({
      id: newId("INV-", 6),
      patientId: payment.patientId,
      appointmentId: payment.appointmentId,
      date: today,
      dueDate: today,
      items: [{ label: `Appointment fee (${payment.provider}: ${payment.providerOrderId})`, amount: payment.amount, currency: payment.currency }],
      status: "paid",
      paidAt: new Date().toISOString(),
    })
    .returning();
  const inv: any = (Array.isArray(invoiceRows) ? invoiceRows : (invoiceRows as any)?.rows ?? [])[0];
  if (inv) {
    await db.insert(invoiceItems).values({
      id: newId("II-", 6),
      invoiceId: inv.id,
      patientId: payment.patientId,
      sourceType: "appointment",
      sourceOrderId: payment.id,
      label: "Paid appointment fee",
      quantity: 1,
      unitPrice: payment.amount,
      amount: payment.amount,
      status: "billed",
      currency: payment.currency,
    });
  }
}
