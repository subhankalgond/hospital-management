import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  patients as patientsT,
  visits as visitsT,
  appointments as appointmentsT,
  prescriptions as prescriptionsT,
  labs as labsT,
  doctors as doctorsT,
  admissions as admissionsT,
  medicationOrders as medicationOrdersT,
} from "@/db/schema";
import type { PatientRow, VisitRow } from "@/db/schema";
import { json, apiError, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

function firstOfMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Resolves a period key to [from, to] inclusive ISO dates. */
function resolvePeriod(
  period: string,
  customFrom: string | null,
  customTo: string | null
): { from: string; to: string } | null {
  const today = todayISO();
  switch (period) {
    case "week": {
      const d = new Date(today + "T00:00:00");
      const dow = (d.getDay() + 6) % 7; // Monday=0
      d.setDate(d.getDate() - dow);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case "month":
      return { from: firstOfMonth(new Date(today + "T00:00:00")), to: today };
    case "year":
      return { from: `${new Date().getFullYear()}-01-01`, to: today };
    case "last-year":
      return { from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` };
    case "custom":
      return customFrom && customTo ? { from: customFrom, to: customTo } : null;
    case "all":
      return null;
    default:
      return null;
  }
}

/**
 * GET /api/patients/[id]/history?period=week|month|year|last-year|custom|all&from=&to=
 *
 * Role rules:
 * - doctor/admin → any patient
 * - patient → only their own id (self-service portal uses the same endpoint)
 *
 * Counts derive from the actual encounter rows in the DB — nothing hardcoded.
 * Viewing a patient's history by staff is audit-logged.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  if (account.role === "patient" && account.patientId !== params.id) {
    return apiError("You can only view your own history.", 403);
  }

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "all";
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");

  const range = resolvePeriod(period, customFrom, customTo);
  if (period === "custom" && !range) {
    return apiError("Both from and to dates are required for a custom range.", 400);
  }

  const db = await getDb();

  const patientRows: PatientRow[] = await db.select().from(patientsT).where(eq(patientsT.id, params.id)).limit(1);
  const patient = patientRows[0];
  if (!patient) return apiError("Patient not found.", 404);

  const allVisits: VisitRow[] = await db
    .select()
    .from(visitsT)
    .where(eq(visitsT.patientId, params.id))
    .orderBy(desc(visitsT.date));

  // period-filtered visits
  const periodVisits = range ? allVisits.filter((v) => v.date >= range.from && v.date <= range.to) : allVisits;

  // real counts computed from encounters
  const today = todayISO();
  const thisWeekFrom = resolvePeriod("week", null, null)!.from;
  const thisMonthFrom = resolvePeriod("month", null, null)!.from;
  const thisYearFrom = resolvePeriod("year", null, null)!.from;

  const counts = {
    total: allVisits.length,
    thisWeek: allVisits.filter((v) => v.date >= thisWeekFrom && v.date <= today).length,
    thisMonth: allVisits.filter((v) => v.date >= thisMonthFrom && v.date <= today).length,
    thisYear: allVisits.filter((v) => v.date >= thisYearFrom && v.date <= today).length,
  };

  type AppointmentRow = typeof appointmentsT.$inferSelect;
  type PrescriptionRow = typeof prescriptionsT.$inferSelect;
  type LabRow = typeof labsT.$inferSelect;
  type DoctorRow = typeof doctorsT.$inferSelect;

  // supporting rows (independent of the period filter to keep encounter
  // context complete — the timeline itself is period-filtered)
  const [appointments, prescriptions, labs, allDoctors, admissions, medOrders] = (await Promise.all([
    db.select().from(appointmentsT).where(eq(appointmentsT.patientId, params.id)).orderBy(desc(appointmentsT.date)),
    db.select().from(prescriptionsT).where(eq(prescriptionsT.patientId, params.id)).orderBy(desc(prescriptionsT.date)),
    db.select().from(labsT).where(eq(labsT.patientId, params.id)).orderBy(desc(labsT.requestedOn)),
    db.select().from(doctorsT),
    db.select().from(admissionsT).where(eq(admissionsT.patientId, params.id)).orderBy(desc(admissionsT.admittedAt)),
    db.select().from(medicationOrdersT).where(eq(medicationOrdersT.patientId, params.id)).orderBy(desc(medicationOrdersT.createdAt)),
  ])) as [AppointmentRow[], PrescriptionRow[], LabRow[], DoctorRow[], (typeof admissionsT.$inferSelect)[], (typeof medicationOrdersT.$inferSelect)[]];

  const upcomings = appointments
    .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const docName = (id: string) => allDoctors.find((d) => d.id === id)?.name ?? "Unknown";

  if (account.role !== "patient") {
    await recordAudit(account, {
      action: "view",
      entity: "patient-history",
      entityId: params.id,
      detail: `period=${period} visits=${periodVisits.length}`,
    });
  }

  return json({
    patient,
    counts,
    admissions: admissions.map((a) => ({
      id: a.id,
      wardName: a.wardName,
      bedLabel: a.bedLabel,
      reason: a.reason,
      status: a.status,
      admittedAt: a.admittedAt,
      dischargedAt: a.dischargedAt,
      doctorName: docName(a.doctorId ?? ""),
    })),
    medicationOrders: medOrders.map((o) => ({
      id: o.id,
      patientId: o.patientId,
      drug: o.drug,
      dosage: o.dosage,
      route: o.route,
      frequency: o.frequency,
      durationDays: o.durationDays,
      quantity: o.quantity,
      status: o.status,
      prescriptionId: o.prescriptionId,
      doctorName: docName(o.doctorId),
      createdAt: o.createdAt,
      dispensedAt: o.dispensedAt,
      dispensedByName: o.dispensedByName,
    })),
    visits: periodVisits.map((v) => ({
      ...v,
      doctorName: docName(v.doctorId),
      prescriptions: prescriptions.filter((rx) => rx.date === v.date).map((rx) => ({
        id: rx.id,
        doctorName: docName(rx.doctorId),
        items: rx.items,
        active: rx.active,
      })),
      labs: labs.filter((l) => l.requestedOn === v.date).map((l) => ({
        id: l.id,
        test: l.test,
        status: l.status,
        result: l.result,
      })),
    })),
    upcoming: upcomings.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      doctorName: docName(a.doctorId),
      reason: a.reason,
      status: a.status,
    })),
    appliedRange: range,
    period,
  });
}
