import { and, eq, ne, lte, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, doctors, invoices, leaves, payments } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { departmentFee } from "@/lib/defaults";
import { todayISO, addDays } from "@/lib/utils";
import { getPaymentConfig, createOrderFor, recordPaidInvoice } from "@/lib/server/payments";
import { recordAudit } from "@/lib/server/audit";

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const body = await readJson<{
    patientId?: string;
    doctorId?: string;
    date?: string;
    time?: string;
    reason?: string;
    paidPaymentId?: string;
  }>(req);
  if (!body) return apiError("Invalid request body.", 400);

  // Authorization check: Patients may only book for themselves; staff may book for any patient.
  const isPatient = account.role === "patient";
  const patientId = isPatient ? account.patientId : body.patientId ?? account.patientId ?? "";
  if (!patientId) return apiError("Missing patient identifier.", 422);

  const doctorId = body.doctorId ?? "";
  const date = body.date ?? "";
  const time = body.time ?? "";
  const reason = (body.reason ?? "").toString().slice(0, 500);
  if (!doctorId || !date || !time) {
    return apiError("Doctor, date and time are required.", 422);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError("Invalid date format.", 422);
  if (!/^\d{2}:\d{2}$/.test(time)) return apiError("Invalid time format.", 422);

  // Past appointment prevention
  const today = todayISO();
  if (date < today) {
    return apiError("Appointments cannot be booked for past dates.", 422);
  }
  if (date === today) {
    const [h, m] = time.split(":").map(Number);
    const now = new Date();
    if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) {
      return apiError("Selected slot has already passed today.", 422);
    }
  }

  const db = await getDb();

  const docRows = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  const doctor = docRows[0];
  if (!doctor) return apiError("Doctor not found.", 404);

  // ── Leave guard: no booking may land on one of the doctor's approved leaves. ──
  const onLeave = await db
    .select({ id: leaves.id })
    .from(leaves)
    .where(
      and(
        eq(leaves.doctorId, doctorId),
        eq(leaves.status, "approved"),
        lte(leaves.fromDate, date),
        gte(leaves.toDate, date)
      )
    )
    .limit(1);
  if (onLeave.length > 0) {
    const lv = (
      await db.select().from(leaves).where(eq(leaves.id, onLeave[0].id)).limit(1)
    )[0];
    return apiError(
      `${doctor.name} is on leave ${lv?.fromDate ?? date} to ${lv?.toDate ?? date}. Please pick another date.`,
      409
    );
  }

  // ── Slot expiration: release pending_payment reservations older than 15 minutes ──
  const fifteenMinutesAgo = String(Date.now() - 15 * 60 * 1000);
  await db
    .update(appointments)
    .set({ status: "cancelled", notes: "Reservation expired" })
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        eq(appointments.date, date),
        eq(appointments.time, time),
        eq(appointments.status, "pending_payment"),
        lte(appointments.createdAt, fifteenMinutesAgo)
      )
    );

  // ── Slot conflict check: check for any active booking on this slot ──
  const conflict = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        eq(appointments.date, date),
        eq(appointments.time, time),
        ne(appointments.status, "cancelled")
      )
    )
    .limit(1);

  let existingReservationId: string | null = null;
  if (conflict.length > 0) {
    const existing = conflict[0];
    // If it's a pending reservation belonging to the same patient, reuse it!
    if (existing.status === "pending_payment" && existing.patientId === patientId) {
      existingReservationId = existing.id;
    } else {
      return apiError("This time slot is no longer available. Please select another time.", 409);
    }
  }

  // ── Payment policy evaluation: only patients are subject to payment gateway prepayment. ──
  // Staff (administrators, clinical staff) can always book without requiring a frontend checkout flow.
  const cfg = getPaymentConfig();
  const requiresPrepayment = isPatient && cfg.enabled && cfg.policy === "required";

  // CASE 1: Prepayment required and verified payment ID provided (finishing booking)
  if (requiresPrepayment && body.paidPaymentId) {
    const pid = body.paidPaymentId;
    const payRows = await db.select().from(payments).where(eq(payments.id, pid)).limit(1);
    const payment = payRows[0];
    if (!payment) return apiError("Payment record not found.", 404);
    if (payment.patientId !== patientId) return apiError("Payment does not belong to this patient.", 403);
    if (payment.status !== "paid") return apiError(`Payment status is ${payment.status}. A verified successful payment is required.`, 409);

    if (payment.appointmentId && payment.appointmentId !== "" && payment.appointmentId !== existingReservationId) {
      return json({ ok: true, id: payment.appointmentId, status: "confirmed", reused: true });
    }

    const apptId = existingReservationId ?? newId("A-", 6);
    const now = Date.now();

    if (existingReservationId) {
      await db
        .update(appointments)
        .set({ status: "confirmed", reason, updatedAt: new Date() })
        .where(eq(appointments.id, apptId));
    } else {
      await db.insert(appointments).values({
        id: apptId,
        patientId,
        doctorId,
        date,
        time,
        durationMin: 30,
        reason,
        status: "confirmed",
        createdAt: String(now),
      });
    }

    // Link payment to confirmed appointment
    await db.update(payments).set({ appointmentId: apptId, updatedAt: new Date() }).where(eq(payments.id, payment.id));
    const updatedPayment = (await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1))[0];
    if (updatedPayment) {
      await recordPaidInvoice(db, updatedPayment);
    }

    await recordAudit(account, { action: "create", entity: "payment-link", entityId: apptId, detail: `appointment ${apptId} confirmed via ${payment.id}` });
    return json({ ok: true, id: apptId, status: "confirmed", paymentLinked: payment.id });
  }

  // CASE 2: Prepayment required, initiating booking (create pending reservation & Razorpay order)
  if (requiresPrepayment && !body.paidPaymentId) {
    const apptId = existingReservationId ?? newId("A-", 6);
    const now = Date.now();

    if (!existingReservationId) {
      await db.insert(appointments).values({
        id: apptId,
        patientId,
        doctorId,
        date,
        time,
        durationMin: 30,
        reason,
        status: "pending_payment",
        createdAt: String(now),
      });
    }

    const orderResult = await createOrderFor(db, {
      patientId,
      appointmentId: apptId,
      idemKey: `pay-appt-${apptId}`,
    });

    if (!orderResult.ok) {
      // If payment order creation failed, cancel the pending reservation
      if (!existingReservationId) {
        await db.update(appointments).set({ status: "cancelled", notes: "Payment order creation failed" }).where(eq(appointments.id, apptId));
      }
      return apiError(orderResult.error, orderResult.status);
    }

    return json({
      ok: true,
      id: apptId,
      status: "pending_payment",
      requiresPayment: true,
      checkout: orderResult.checkout,
      paymentId: orderResult.payment.id,
    });
  }

  // CASE 3: No prepayment required (staff booking on behalf of patient, or payment policy off/optional)
  const apptId = existingReservationId ?? newId("A-", 6);
  const now = Date.now();

  if (existingReservationId) {
    await db
      .update(appointments)
      .set({ status: "confirmed", reason })
      .where(eq(appointments.id, apptId));
  } else {
    await db.insert(appointments).values({
      id: apptId,
      patientId,
      doctorId,
      date,
      time,
      durationMin: 30,
      reason,
      status: "confirmed",
      createdAt: String(now),
    });
  }

  // Auto-generate consultation invoice
  const invId = newId("INV-", 6);
  await db.insert(invoices).values({
    id: invId,
    patientId,
    appointmentId: apptId,
    date,
    dueDate: addDays(today, 14),
    items: [{ label: `${doctor.department} consultation`, amount: departmentFee(doctor.department) }],
    status: "pending",
    paidAt: null,
  });

  await recordAudit(account, { action: "create", entity: "appointment", entityId: apptId, detail: `appointment ${apptId} booked by ${account.role} ${account.name}` });
  return json({ ok: true, id: apptId, status: "confirmed", invoiceId: invId });
}
