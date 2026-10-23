import { getDb } from "@/db";
import { json } from "@/lib/server/api";
import { applyGatewayEvent, verifyWebhookSignature, recordPaidInvoice } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook receiver.
 *
 * - Verifies the x-razorpay-signature header against RAZORPAY_WEBHOOK_SECRET.
 * - Processes idempotently (event log; replays are no-ops).
 * - Never trusts the payload beyond the verified event envelope.
 *
 * Configure in the Razorpay dashboard → Webhooks:
 *   URL:  https://<your-domain>/api/payments/webhook
 *   Event subscriptions: payment.captured, payment.failed, order.paid, refund.processed
 *   Secret: value of RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return json({ error: "Invalid webhook signature." }, 401);
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Malformed webhook payload." }, 400);
  }

  const type = event?.event ?? "unknown";
  const ent = (entity: Record<string, any>) => entity ?? {};
  const db = await getDb();
  const eventId = event?.id ?? `${type}@${(ent(event?.payload)?.order?.entity as any)?.id ?? ""}`;
  const orderId = (ent(event?.payload)?.order?.entity as any)?.id ??
    (ent(event?.payload)?.payment?.entity as any)?.order_id ?? "";

  const paymentEntity = (ent(event?.payload)?.payment?.entity as any) ?? {};

  let status: "paid" | "failed" | "pending" = "pending";
  if (type === "payment.captured" || type === "order.paid") status = "paid";
  else if (type === "payment.failed") status = "failed";

  let applied: Awaited<ReturnType<typeof applyGatewayEvent>> | null = null;
  if (orderId) {
    applied = await applyGatewayEvent(db, {
      providerOrderId: orderId,
      providerPaymentId: paymentEntity.id,
      status,
      type,
      eventId,
      failureReason: paymentEntity.error_description ?? paymentEntity.error_reason,
    });
    if (applied?.ok && applied.payment?.appointmentId && applied.payment.status === "paid") {
      await recordPaidInvoice(db, applied.payment);
    }
  }

  return json({ ok: true, handled: applied?.ok ?? true, duplicate: applied?.duplicate ?? false });
}
