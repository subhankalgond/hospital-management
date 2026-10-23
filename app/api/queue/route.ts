import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, doctors, queueEntries } from "@/db/schema";
import {
  addToQueue,
  callNext,
  queueAction,
  queueForDoctor,
  queuePositionForPatient,
  publicDisplay,
  queueDate,
  type QueueAction,
} from "@/lib/server/queue";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/queue?mine=1                      → patient's live position
 * GET /api/queue?doctorId=…                  → doctor waiting queue
 * GET /api/queue?display=1                   → public board (tokens only)
 */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const db = await getDb();

  const url = new URL(req.url);
  const display = url.searchParams.get("display");
  const mine = url.searchParams.get("mine");
  const doctorId = url.searchParams.get("doctorId") ?? "";

  if (display) {
    // The board is intentionally anonymous and safe to poll from the
    // waiting-room screen. It still requires *a* signed-in staff session so a
    // random internet caller cannot scrape it lightly — but it returns NO
    // patient identifying data by construction (publicDisplay only selects
    // token numbers and doctor/department labels).
    return json(await publicDisplay(db, queueDate()));
  }

  if (mine) {
    if (account.role !== "patient" || !account.patientId) {
      return apiError("Only patients have a personal queue position.", 403);
    }
    const pos = await queuePositionForPatient(db, account.patientId);
    return json({ position: pos });
  }

  if (doctorId) {
    if (account.role === "doctor" && account.doctorId && account.doctorId !== doctorId) {
      return apiError("You can only view your own queue.", 403);
    }
    const view = await queueForDoctor(db, doctorId, queueDate());
    return json(view);
  }

  // Default for staff: all of today's entries (admin) or their own (doctor).
  if (account.role === "doctor" && account.doctorId) {
    return json(await queueForDoctor(db, account.doctorId, queueDate()));
  }
  if (account.role !== "admin") return apiError("Not allowed.", 403);
  const day = queueDate();
  const entries = await db
    .select()
    .from(queueEntries)
    .where(eq(queueEntries.queueDate, day))
    .orderBy(queueEntries.doctorId, queueEntries.tokenNo);
  return json({ entries, waiting: entries.filter((e: { status: string }) => e.status === "waiting").length, currentCalled: null });
}

/**
 * POST /api/queue — issue a token.
 * Patients enqueue against an existing confirmed appointment; staff may issue
 * walk-in / emergency tokens (feature 9). Body: {doctorId, patientId?,
 * source?, priority?, appointmentId?, note?, idemKey?}
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const body = await readJson<{
    doctorId?: string;
    patientId?: string;
    source?: "appointment" | "walk_in" | "emergency";
    priority?: "normal" | "emergency";
    appointmentId?: string;
    note?: string;
    idemKey?: string;
  }>(req);
  if (!body?.doctorId) return apiError("doctorId is required.", 422);
  const db = await getDb();

  let patientId = body.patientId ?? "";
  let source: "appointment" | "walk_in" | "emergency" = body.source ?? "appointment";
  let priority: "normal" | "emergency" = body.priority === "emergency" ? "emergency" : "normal";

  const staff = account.role === "admin" || account.role === "doctor";
  if (!staff) {
    // Patient self-enqueue: only themselves, appointment-only, via an
    // appointment that exists, today, belongs to them and is confirmed.
    if (account.role !== "patient" || !account.patientId) return apiError("Not allowed.", 403);
    const appt = body.appointmentId
      ? (await db.select().from(appointments).where(eq(appointments.id, body.appointmentId)).limit(1))[0]
      : undefined;
    if (!appt) return apiError("A confirmed appointment is required to join the queue.", 422);
    if (appt.patientId !== account.patientId) return apiError("Not your appointment.", 403);
    const today = queueDate();
    if (appt.date !== today) return apiError("Queue tokens are issued on the clinic day itself.", 409);
    if (appt.status !== "confirmed") return apiError("Only confirmed appointments can join the queue.", 409);
    patientId = account.patientId;
    source = "appointment";
    priority = "normal";
  } else if (account.role === "doctor" && !body.patientId) {
    return apiError("patientId is required.", 422);
  }

  const result = await addToQueue(db, {
    doctorId: body.doctorId,
    patientId,
    source,
    priority,
    appointmentId: body.appointmentId,
    note: body.note,
    idemKey: body.idemKey,
    registeredBy: account.id,
  });
  if (!result.ok) return apiError(result.error, result.status);
  if (!result.duplicate) {
    await recordAudit(account, {
      action: "create",
      entity: "queue-entry",
      entityId: result.entry.id,
      detail: `token ${result.entry.tokenNo} source=${result.entry.source} priority=${result.entry.priority}`,
    });
  }
  return json({ ok: true, entry: result.entry, duplicate: result.duplicate });
}

/** PATCH /api/queue — staff queue actions (call result states, notes, priority). */
export async function PATCH(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "doctor" && account.role !== "admin") {
    return apiError("Not allowed.", 403);
  }
  const body = await readJson<{ id?: string; action?: QueueAction; note?: string; priority?: "normal" | "emergency" }>(req);
  if (!body?.id || !body?.action) return apiError("id and action are required.", 422);
  const db = await getDb();

  const result = await queueAction(db, body.id, body.action, {
    account: { id: account.id, role: account.role, name: account.name, doctorId: account.doctorId },
    note: body.note,
    priority: body.priority,
  });
  if (!result.ok) return apiError(result.error ?? "Action failed.", result.status ?? 400);
  await recordAudit(account, {
    action: "update",
    entity: "queue-entry",
    entityId: body.id,
    detail: `action=${body.action}`,
  });
  return json({ ok: true, entry: result.entry });
}

/**
 * PUT /api/queue {doctorId} — call next patient (race-safe, server-wide).
 * Returns the full anonymized display payload for the waiting-room screen.
 */
export async function PUT(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "doctor" && account.role !== "admin") {
    return apiError("Not allowed.", 403);
  }
  const body = await readJson<{ doctorId?: string }>(req);
  const doctorId = account.role === "doctor" ? account.doctorId ?? "" : body?.doctorId ?? "";
  if (!doctorId) return apiError("doctorId is required.", 422);

  const db = await getDb();
  const result = await callNext(db, doctorId, account.id, account.name);
  if (!result.ok) return apiError(result.error, result.status);
  await recordAudit(account, {
    action: "update",
    entity: "queue-entry",
    entityId: result.entry.id,
    detail: "called next",
  });

  const docName = (await db.select({ name: doctors.name, department: doctors.department }).from(doctors).where(eq(doctors.id, doctorId)).limit(1))[0];
  return json({
    ok: true,
    token: result.entry.tokenNo,
    entryId: result.entry.id,
    doctorName: docName?.name ?? "",
    department: docName?.department ?? "",
    // No patient identity crosses to the room display.
    priority: result.entry.priority,
  });
}
