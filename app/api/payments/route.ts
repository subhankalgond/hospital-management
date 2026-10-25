import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import {
  getPaymentConfig,
  createOrderFor,
  verifyCheckoutSignature,
  applyGatewayEvent,
  recordPaidInvoice,
} from "@/lib/server/payments";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/** GET /api/payments → configuration for the booking UI (no secrets). */
export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const cfg = getPaymentConfig();
  return json({
    enabled: cfg.enabled,
    policy: cfg.policy,
    keyId: cfg.keyId, // public key id — safe for checkout
    feeRupees: cfg.feeRupees,
    currency: cfg.currency,
    missingEnv: cfg.missingEnv,
  });
}

/**
 * POST /api/payments — create a gateway order before booking confirmation.
 * Body: { appointmentId?, patientId? }
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const body = await readJson<{ appointmentId?: string; patientId?: string }>(req);

  // Patients may only start payments for themselves.
  const patientId = account.role === "patient" ? account.patientId ?? "" : body?.patientId ?? account.patientId ?? "";
  if (!patientId) return apiError("Missing patient.", 422);
  if (account.role === "patient" && body?.patientId && body.patientId !== account.patientId) {
    return apiError("Not allowed.", 403);
  }

  const db = await getDb();
  const result = await createOrderFor(db, {
    patientId,
    appointmentId: body?.appointmentId,
    idemKey: body?.appointmentId ? `pay-appt-${body.appointmentId}` : undefined,
  });
  if (!result.ok) return apiError(result.error, result.status);
  return json({
    ok: true,
    checkout: result.checkout,
    paymentId: result.payment.id,
    // checkout component (public data only)
  });
}

/**
 * PUT /api/payments — verify a checkout callback (order_id|payment_id|signature)
 * and only then mark the payment paid + draw the invoice.
 */
export async function PUT(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const body = await readJson<{ orderId?: string; paymentId?: string; signature?: string }>(req);
  if (!body?.orderId || !body?.paymentId || !body?.signature) {
    return apiError("orderId, paymentId and signature are required.", 422);
  }
  if (!verifyCheckoutSignature(body.orderId, body.paymentId, body.signature)) {
    await recordAudit(account, { action: "update", entity: "payment", entityId: body.orderId, detail: "invalid checkout signature" });
    return apiError("Payment signature verification failed. The payment was NOT confirmed.", 400);
  }
  const db = await getDb();
  const applied = await applyGatewayEvent(db, {
    providerOrderId: body.orderId,
    providerPaymentId: body.paymentId,
    status: "paid",
    type: "checkout.verified",
  });
  if (!applied.ok || !applied.payment) return apiError(applied.error ?? "Verification failed.", 404);
  if (applied.payment.appointmentId) {
    await db.update(appointments).set({ status: "confirmed" }).where(eq(appointments.id, applied.payment.appointmentId));
    await recordPaidInvoice(db, applied.payment);
  }
  await recordAudit(account, { action: "update", entity: "payment", entityId: applied.payment.id, detail: "checkout verified" });
  return json({
    ok: true,
    status: applied.payment.status,
    duplicate: applied.duplicate,
    paymentId: applied.payment.id,
    appointmentId: applied.payment.appointmentId,
  });
}

/** DELETE is not supported — refunds use the webhook/payment ref in Razorpay. */
export async function DELETE() {
  return apiError("Refunds are handled by the gateway dashboard/webhook.", 405);
}
