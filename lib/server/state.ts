/** Builds the role-scoped data snapshot that GET /api/state returns. */
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";import 
  {
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
  emergencyCases as emergencyT,
  beds as bedsT,
  bedAudit as bedAuditT,
  medicationOrders as medicationOrdersT,
  admissions as admissionsT,
  invoiceItems as invoiceItemsT,
  inventory as inventoryT,
  servicePrices as servicePricesT,
  symptomAssessments as symptomAssessmentsT,
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
  type EmergencyCaseRow,
  type BedRow,
  type BedAuditRow,
  type MedicationOrderRow,
  type AdmissionRow,
  type InvoiceItemRow,
  type InventoryRow,
  type ServicePriceRow,
  type SymptomAssessmentRow,
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
  emergencies: EmergencyCaseRow[];
  beds: BedRow[];
  bedAudit: BedAuditRow[];
  medicationOrders: MedicationOrderRow[];
  admissions: AdmissionRow[];
  invoiceItems: InvoiceItemRow[];
  inventory: InventoryRow[];
  servicePrices: ServicePriceRow[];
  symptomAssessments: SymptomAssessmentRow[];
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
 * Runs promise factories in small concurrent batches. The Supabase pooler
 * (PgBouncer/Supavisor transaction mode) misbehaves when a single client
 * floods it with a dozen simultaneous connections — unbounded Promise.all
 * here caused 90s+ stalls — while batches of 4 stay fast and safe.
 */
async function inBatches<T extends readonly (() => unknown)[]>(
  factories: T,
  size = 4
): Promise<{ [K in keyof T]: T[K] extends () => infer R ? R : never }> {
  const out: unknown[] = [];
  for (let i = 0; i < factories.length; i += size) {
    out.push(...(await Promise.all(factories.slice(i, i + size).map((f) => f()))));
  }
  return out as { [K in keyof T]: T[K] extends () => infer R ? R : never };
}

/**
 * Loads every collection, scoped by role:
 * - patient → only their own rows (plus the doctors list for booking)
 * - doctor/admin → the full clinic view
 * - admins additionally get the accounts list
 */
export async function buildState(account: SessionAccount): Promise<DataState> {
  const db = await getDb();

  const session = {
    id: account.id,
    role: account.role,
    name: account.name,
    email: account.email,
    patientId: account.patientId,
    doctorId: account.doctorId,
  };

  // ── Fast path for patients: targeted SQL queries filtered by patient_id ──
  if (account.role === "patient") {
    const pid = account.patientId ?? "__none__";
    const [
      doctorRows,
      patientRows,
      appointmentRows,
      prescriptionRows,
      visitRows,
      invoiceRows,
      labRows,
      leaveRows,
      medicationOrderRows,
      admissionRows,
      invoiceItemRows,
    ] = await inBatches(
      [
        () => db.select().from(doctorsT).orderBy(desc(doctorsT.createdAt)),
        () => db.select().from(patientsT).where(eq(patientsT.id, pid)).limit(1),
        () => db.select().from(appointmentsT).where(eq(appointmentsT.patientId, pid)).orderBy(desc(appointmentsT.createdAt)),
        () => db.select().from(prescriptionsT).where(eq(prescriptionsT.patientId, pid)).orderBy(desc(prescriptionsT.date)),
        () => db.select().from(visitsT).where(eq(visitsT.patientId, pid)).orderBy(desc(visitsT.date)),
        () => db.select().from(invoicesT).where(eq(invoicesT.patientId, pid)).orderBy(desc(invoicesT.date)),
        () => db.select().from(labsT).where(eq(labsT.patientId, pid)).orderBy(desc(labsT.requestedOn)),
        () => db.select().from(leavesT).where(eq(leavesT.status, "approved")).orderBy(desc(leavesT.fromDate)),
        () => db.select().from(medicationOrdersT).where(eq(medicationOrdersT.patientId, pid)).orderBy(desc(medicationOrdersT.createdAt)),
        () => db.select().from(admissionsT).where(eq(admissionsT.patientId, pid)).orderBy(desc(admissionsT.admittedAt)),
        () => db.select().from(invoiceItemsT).where(eq(invoiceItemsT.patientId, pid)).orderBy(desc(invoiceItemsT.createdAt)),
      ],
      4
    );

    return {
      accounts: [],
      doctors: doctorRows,
      patients: patientRows,
      appointments: appointmentRows,
      prescriptions: prescriptionRows,
      visits: visitRows,
      invoices: invoiceRows,
      labs: labRows,
      wards: [],
      leaves: leaveRows,
      emergencies: [],
      beds: [],
      bedAudit: [],
      medicationOrders: medicationOrderRows,
      admissions: admissionRows,
      invoiceItems: invoiceItemRows,
      inventory: [],
      servicePrices: [],
      symptomAssessments: [],
      session,
      meta: { serverTime: new Date().toISOString() },
    };
  }

  const [
    doctorRows,
    patientRows,
    appointmentRows,
    prescriptionRows,
    visitRows,
    invoiceRows,
    labRows,
    wardRows,
    leaveRows,
    emergencyRows,
    bedRows,
    bedAuditRows,
    medicationOrderRows,
    admissionRows,
    invoiceItemRows,
    inventoryRows,
    servicePriceRows,
    assessmentRows,
  ] = await inBatches([
    () => db.select().from(doctorsT).orderBy(desc(doctorsT.createdAt)),
    () => db.select().from(patientsT).orderBy(desc(patientsT.createdAt)),
    () => db.select().from(appointmentsT).orderBy(desc(appointmentsT.createdAt)),
    () => db.select().from(prescriptionsT).orderBy(desc(prescriptionsT.date)),
    () => db.select().from(visitsT).orderBy(desc(visitsT.date)),
    () => db.select().from(invoicesT).orderBy(desc(invoicesT.date)),
    () => db.select().from(labsT).orderBy(desc(labsT.requestedOn)),
    () => db.select().from(wardsT),
    () => db.select().from(leavesT).orderBy(desc(leavesT.fromDate)),
    () => db.select().from(emergencyT).orderBy(desc(emergencyT.arrivalAt)),
    () => db.select().from(bedsT).orderBy(bedsT.wardId),
    () => db.select().from(bedAuditT).orderBy(desc(bedAuditT.at)).limit(200),
    () => db.select().from(medicationOrdersT).orderBy(desc(medicationOrdersT.createdAt)).limit(500),
    () => db.select().from(admissionsT).orderBy(desc(admissionsT.admittedAt)).limit(500),
    () => db.select().from(invoiceItemsT).orderBy(desc(invoiceItemsT.createdAt)).limit(500),
    () => db.select().from(inventoryT).orderBy(inventoryT.name),
    () => db.select().from(servicePricesT),
    () => db.select().from(symptomAssessmentsT).orderBy(desc(symptomAssessmentsT.createdAt)).limit(100),
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

  /** Clinical staff (doctor/admin) see full clinical state; pharmacy and lab
   *  roles get only the patient fields they need — never clinical history. */
  const isClinical = account.role === "doctor" || account.role === "admin";
  const limitedPatients = isClinical
    ? patientRows
    : patientRows.map((p: PatientRow) => ({
        id: p.id,
        patientCode: p.patientCode,
        name: p.name,
        dob: p.dob,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        allergies: p.allergies, // clinically relevant for dispensing / sample handling
        email: "",
        phone: "",
        address: "",
        conditions: [],
        immunizations: [],
        insurance: { provider: "", number: "" },
        emergencyContact: { name: "", phone: "", relation: "" },
        createdAt: p.createdAt,
      }));

  return {
    accounts: accountsOut,
    doctors: doctorRows.map((d: DoctorRow) => ({
      id: d.id,
      name: d.name,
      qualification: d.qualification,
      licenseNo: account.role === "admin" ? d.licenseNo : "",
      specialty: d.specialty,
      department: d.department,
      email: account.role === "admin" ? d.email : "",
      phone: account.role === "admin" ? d.phone : "",
      room: d.room,
      experienceYears: d.experienceYears,
      rating: d.rating,
      onCall: d.onCall,
      shift: d.shift,
      createdAt: d.createdAt,
    })),
    patients: limitedPatients,
    appointments: account.role === "lab" ? [] : appointmentRows,
    prescriptions: account.role === "pharmacy" || account.role === "lab" ? [] : prescriptionRows,
    visits: account.role === "pharmacy" ? [] : visitRows,
    invoices: isClinical ? invoiceRows : [],
    labs: labRows.filter((l: LabRow) => l.workflow !== "cancelled" || isClinical),
    wards: wardsOut,
    leaves: leaveRows,
    emergencies: isClinical ? emergencyRows : [],
    beds: account.role === "admin" ? bedRows : [],
    bedAudit: account.role === "admin" ? bedAuditRows : [],
    medicationOrders: medicationOrderRows,
    admissions: admissionRows,
    invoiceItems: isClinical ? invoiceItemRows : [],
    inventory: inventoryRows,
    servicePrices: servicePriceRows,
    symptomAssessments: isClinical ? assessmentRows : [],
    session,
    meta: { serverTime: new Date().toISOString() },
  };
}
