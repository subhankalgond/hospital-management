import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, doctors, invoices } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { departmentFee } from "@/lib/defaults";
import { todayISO, addDays } from "@/lib/utils";

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
  }>(req);
  if (!body) return apiError("Invalid request body.");

  // Patients may only book for themselves; staff may book for any patient.
  const patientId =
    account.role === "patient" ? account.patientId : body.patientId ?? "";
  if (!patientId) return apiError("Missing patient.", 422);

  const doctorId = body.doctorId ?? "";
  const date = body.date ?? "";
  const time = body.time ?? "";
  const reason = (body.reason ?? "").toString().slice(0, 500);
  if (!doctorId || !date || !time) {
    return apiError("Doctor, date and time are required.", 422);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError("Invalid date.", 422);
  if (!/^\d{2}:\d{2}$/.test(time)) return apiError("Invalid time.", 422);

  const db = await getDb();

  const docRows = await db.select().from(doctors).where(eq(doctors.id, doctorId)).limit(1);
  const doctor = docRows[0];
  if (!doctor) return apiError("Doctor not found.", 404);

  // ── Slot conflict check + insert. PGlite is single-connection so the
  // check-then-insert is effectively atomic in dev; on Supabase the unique
  // index (created via migration SQL below) is the hard guarantee.
  const conflict = await db
    .select({ id: appointments.id })
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
  if (conflict.length > 0) {
    return apiError("Slot just got taken. Please pick another time.", 409);
  }

  const id = newId("A-", 6);
  const now = Date.now();

  await db.insert(appointments).values({
    id,
    patientId,
    doctorId,
    date,
    time,
    durationMin: 30,
    reason,
    status: "confirmed",
    createdAt: String(now),
  });

  // Auto-generate the consultation invoice from the department fee.
  const invId = newId("INV-", 6);
  await db.insert(invoices).values({
    id: invId,
    patientId,
    appointmentId: id,
    date,
    dueDate: addDays(todayISO(), 14),
    items: [{ label: `${doctor.department} consultation`, amount: departmentFee(doctor.department) }],
    status: "pending",
  });

  return json({ ok: true, id, invoiceId: invId });
}
