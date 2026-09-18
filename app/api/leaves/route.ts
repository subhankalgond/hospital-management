import { and, eq, ne, lte, gte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { leaves, appointments, doctors } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { todayISO, addDays } from "@/lib/utils";

/**
 * POST /api/leaves — a doctor requests leave.
 *
 * The one-day-before rule is enforced HERE, on the server: a leave must start
 * tomorrow at the earliest. Patients can therefore always book "today" with
 * confidence that the doctor will be present.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "doctor" || !guard.account.doctorId) {
    return apiError("Only doctors can request leave.", 403);
  }
  const doctorId = guard.account.doctorId;

  const body = await readJson<{ fromDate?: string; toDate?: string; reason?: string }>(req);
  if (!body) return apiError("Invalid request body.");

  const fromDate = (body.fromDate ?? "").slice(0, 10);
  const toDate = (body.toDate ?? "").slice(0, 10);
  const reason = (body.reason ?? "").toString().trim().slice(0, 300);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return apiError("Please pick a valid from and to date.", 422);
  }
  if (toDate < fromDate) {
    return apiError("The end date cannot be before the start date.", 422);
  }

  // ── the one-day-before rule ──
  const earliest = addDays(todayISO(), 1);
  if (fromDate < earliest) {
    return apiError(
      "Leave must be requested at least one day before it starts — it cannot begin today or in the past.",
      422
    );
  }

  const db = await getDb();

  // Sanity: doctor must exist.
  const doc = (await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1))[0];
  if (!doc) return apiError("Doctor profile not found.", 404);

  // Overlap check against existing leaves (same doctor, approved).
  const overlapping = await db
    .select({ id: leaves.id })
    .from(leaves)
    .where(
      and(
        eq(leaves.doctorId, doctorId),
        eq(leaves.status, "approved"),
        lte(leaves.fromDate, toDate),
        gte(leaves.toDate, fromDate)
      )
    )
    .limit(1);
  if (overlapping.length > 0) {
    return apiError("You already have approved leave covering (part of) these dates.", 409);
  }

  // How many real bookings are inside the range? (informational for the toast)
  const affected = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        eq(appointments.date, fromDate),
        ne(appointments.status, "cancelled")
      )
    );
  void affected;

  const id = newId("LV-", 6);
  await db.insert(leaves).values({
    id,
    doctorId,
    fromDate,
    toDate,
    reason,
    status: "approved",
    requestedOn: todayISO(),
  });

  return json({ ok: true, id });
}

/**
 * GET /api/leaves — list leaves. Doctors see their own; admin sees all;
 * patients get [] (they only need slots, which already respect leaves).
 */
export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;

  const db = await getDb();
  if (guard.account.role === "doctor" && guard.account.doctorId) {
    const mine = await db
      .select()
      .from(leaves)
      .where(or(eq(leaves.doctorId, guard.account.doctorId), eq(leaves.status, "approved")));
    return json({ leaves: mine });
  }
  if (guard.account.role === "admin") {
    const all = await db.select().from(leaves);
    return json({ leaves: all });
  }
  return json({ leaves: [] });
}
