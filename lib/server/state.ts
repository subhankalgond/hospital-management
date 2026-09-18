/** Builds the role-scoped data snapshot that GET /api/state returns. */
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts as accountsT,
  doctors as doctorsT,
  patients as patientsT,
  appointments as appointmentsT,
  prescriptions as prescriptionsT,
  visits as visitsT,
  invoices as invoicesT,
  labs as labsT,
  wards as wardsT,
  leaves as leavesT,
  type AccountRow,
  type PatientRow,
  type DoctorRow,
  type AppointmentRow,
  type PrescriptionRow,
  type VisitRow,
  type InvoiceRow,
  type LabRow,
  type WardRow,
  type LeaveRow,
} from "@/db/schema";
import type { SessionAccount } from "./auth";

export interface DataState {
  /** populated only for admins */
  accounts: AccountRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  appointments: AppointmentRow[];
  prescriptions: PrescriptionRow[];
  visits: VisitRow[];
  invoices: InvoiceRow[];
  labs: LabRow[];
  wards: WardRow[];
  leaves: LeaveRow[];
  session: {
    id: string;
    role: string;
    name: string;
    email: string;
    patientId?: string;
    doctorId?: string;
  };
  meta: { serverTime: string };
}

/**
 * Loads every collection, scoped by role:
 * - patient → only their own rows (plus the doctors list for booking)
 * - doctor/admin → the full clinic view
 * - admins additionally get the accounts list
 */
export async function buildState(account: SessionAccount): Promise<DataState> {
  const db = await getDb();

  const [doctorRows, patientRows, appointmentRows, prescriptionRows, visitRows, invoiceRows, labRows, wardRows, leaveRows] =
    await Promise.all([
      db.select().from(doctorsT).orderBy(desc(doctorsT.createdAt)),
      db.select().from(patientsT).orderBy(desc(patientsT.createdAt)),
      db.select().from(appointmentsT).orderBy(desc(appointmentsT.createdAt)),
      db.select().from(prescriptionsT).orderBy(desc(prescriptionsT.date)),
      db.select().from(visitsT).orderBy(desc(visitsT.date)),
      db.select().from(invoicesT).orderBy(desc(invoicesT.date)),
      db.select().from(labsT).orderBy(desc(labsT.requestedOn)),
      db.select().from(wardsT),
      db.select().from(leavesT).orderBy(desc(leavesT.fromDate)),
    ]);

  // Ward structure is fixed infrastructure; seed it on first ever load.
  let wardsOut = wardRows;
  if (wardsOut.length === 0) {
    const { initialWards } = await import("@/lib/defaults");
    const seed = initialWards();
    if (seed.length > 0) {
      await db.insert(wardsT).values(seed);
      wardsOut = seed;
    }
  }

  let accountsOut: AccountRow[] = [];
  if (account.role === "admin") {
    // Credentials never leave the server: strip password material before the
    // rows go into the response (smaller payload, no hash exposure).
    const rows = await db.select().from(accountsT).orderBy(desc(accountsT.createdAt));
    accountsOut = rows.map((a: AccountRow) => ({ ...a, passwordHash: "", salt: null }));
  }

  const isPatient = account.role === "patient";
  const pid = account.patientId ?? "__none__";

  const session = {
    id: account.id,
    role: account.role,
    name: account.name,
    email: account.email,
    patientId: account.patientId,
    doctorId: account.doctorId,
  };

  if (!isPatient) {
    return {
      accounts: accountsOut,
      doctors: doctorRows,
      patients: patientRows,
      appointments: appointmentRows,
      prescriptions: prescriptionRows,
      visits: visitRows,
      invoices: invoiceRows,
      labs: labRows,
      wards: wardsOut,
      leaves: leaveRows,
      session,
      meta: { serverTime: new Date().toISOString() },
    };
  }

  // Patient view: strictly their own data.
  const mine = <T extends { patientId: string }>(rows: T[]): T[] =>
    rows.filter((r) => r.patientId === pid);
  const myPatients = patientRows.filter((p: PatientRow) => p.id === pid);

  return {
    accounts: [],
    doctors: doctorRows,
    patients: myPatients,
    appointments: mine(appointmentRows),
    prescriptions: mine(prescriptionRows),
    visits: mine(visitRows),
    invoices: mine(invoiceRows),
    labs: mine(labRows),
    wards: [],
    leaves: leaveRows,
    session,
    meta: { serverTime: new Date().toISOString() },
  };
}
