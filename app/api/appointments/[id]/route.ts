import { and, eq, ne, lte, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, leaves, doctors } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";

type Action = "reschedule" | "cancel" | "confirm" | "no-show" | "queue";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const body = await readJson<{
    action?: Action;
    date?: string;
    time?: string;
    queueStatus?: string;
  }>(req);
  if (!body?.action) return apiError("Missing action.", 422);

  const db = await getDb();
  const rows = await db.select().from(appointments).where(eq(appointments.id, params.id)).limit(1);
  const appt = rows[0];
  if (!appt) return apiError("Appointment not found.", 404);

  // Patients may only touch their own appointments.
  if (account.role === "patient" && appt.patientId !== account.patientId) {
    return apiError("You can only manage your own appointments.", 403);
  }

  const patch: Partial<typeof appointments.$inferInsert> = {};
  const action = body.action;

  if (action === "reschedule") {
    const date = body.date ?? "";
    const time = body.time ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return apiError("Invalid date/time.", 422);
    }
    const conflict = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctorId, appt.doctorId),
          eq(appointments.date, date),
          eq(appointments.time, time),
          ne(appointments.status, "cancelled"),
          ne(appointments.id, appt.id)
        )
      )
      .limit(1);
    if (conflict.length > 0) return apiError("That slot is already booked.", 409);

    // Leave guard: rescheduling onto a leave day is blocked too.
    const docRow = (await db.select().from(doctors).where(eq(doctors.id, appt.doctorId)).limit(1))[0];
    const lv = await db
      .select()
      .from(leaves)
      .where(
        and(
          eq(leaves.doctorId, appt.doctorId),
          eq(leaves.status, "approved"),
          lte(leaves.fromDate, date),
          gte(leaves.toDate, date)
        )
      )
      .limit(1);
    if (lv.length > 0) {
      return apiError(
        `${docRow?.name ?? "This doctor"} is on leave ${lv[0].fromDate} to ${lv[0].toDate}. Please pick another date.`,
        409
      );
    }
    patch.date = date;
    patch.time = time;
  } else if (action === "cancel") {
    patch.status = "cancelled";
  } else if (action === "confirm") {
    patch.status = "confirmed";
  } else if (action === "no-show") {
    patch.status = "no-show";
  } else if (action === "queue") {
    const q = body.queueStatus ?? "";
    if (!["waiting", "in-progress", "completed"].includes(q)) {
      return apiError("Invalid queue status.", 422);
    }
    patch.queueStatus = q;
    // Completing the queue visit marks the appointment completed as well.
    if (q === "completed") patch.status = "completed";
  } else {
    return apiError("Unknown action.", 422);
  }

  await db.update(appointments).set(patch).where(eq(appointments.id, appt.id));
  return json({ ok: true });
}
