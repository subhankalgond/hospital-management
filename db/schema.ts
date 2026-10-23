import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * CarePulse schema — single source of truth shared by every device.
 *
 * `accounts` holds credentials (server-side scrypt hash); role profiles live
 * in `patients` / `doctors`. Clinical data links by profile id (patientId /
 * doctorId), matching the client's existing shape.
 */

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull(), // patient | doctor | admin
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // Legacy (localStorage-imported) accounts keep their original SHA-256
    // parameters here; the hash is upgraded to scrypt on first sign-in.
    salt: text("salt"),
    hashAlgo: text("hash_algo").notNull().default("scrypt"), // scrypt | sha256
    patientId: text("patient_id"),
    doctorId: text("doctor_id"),
    createdAt: text("created_at").notNull(), // ISO date
  },
  (t) => ({
    emailIdx: uniqueIndex("accounts_email_idx").on(t.email),
  })
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const patients = pgTable(
  "patients",
  {
    id: text("id").primaryKey(),
    /** Permanent human-readable Patient ID (PAT-YYYY-000001). Assigned once
     *  server-side at registration; never edited by users; never reissued. */
    patientCode: text("patient_code").notNull().default(""),
    name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  dob: text("dob").notNull().default(""),
  gender: text("gender").notNull().default("other"),
  bloodGroup: text("blood_group").notNull().default(""),
  address: text("address").notNull().default(""),
  emergencyContact: jsonb("emergency_contact")
    .notNull()
    .default({ name: "", phone: "", relation: "" }),
  allergies: jsonb("allergies").notNull().default([]),
  conditions: jsonb("conditions").notNull().default([]),
  immunizations: jsonb("immunizations").notNull().default([]),
  insurance: jsonb("insurance").notNull().default({ provider: "", number: "" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  /** Two patients can never share one Patient ID. */
  codeUnique: uniqueIndex("patients_code_uniq_idx").on(t.patientCode).where(sql`patient_code <> ''`),
}));

export const doctors = pgTable("doctors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  qualification: text("qualification").notNull().default(""),
  licenseNo: text("license_no").notNull().default(""),
  specialty: text("specialty").notNull(),
  department: text("department").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  room: text("room").notNull().default("—"),
  experienceYears: integer("experience_years").notNull().default(0),
  rating: real("rating").notNull().default(0),
  onCall: boolean("on_call").notNull().default(false),
  shift: text("shift").notNull().default("morning"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    time: text("time").notNull(), // HH:mm 24h
    durationMin: integer("duration_min").notNull().default(30),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("confirmed"),
    queueStatus: text("queue_status"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(), // epoch millis as string (sortable)
  },
  (t) => ({
    slotIdx: index("appointments_slot_idx").on(t.doctorId, t.date, t.time),
  })
);

export const prescriptions = pgTable("prescriptions", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  doctorId: text("doctor_id").notNull(),
  date: text("date").notNull(),
  items: jsonb("items").notNull().default([]),
  active: boolean("active").notNull().default(true),
  /** e-prescription safety-check payload (lib/server/clinical-checks.ts) */
  checks: jsonb("checks"),
  checksAt: text("checks_at"),
  checksEngine: text("checks_engine").notNull().default(""),
  /** clinician override justification recorded when issuing with warnings */
  overrideReason: text("override_reason"),
});

export const visits = pgTable("visits", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  doctorId: text("doctor_id").notNull(),
  date: text("date").notNull(),
  department: text("department").notNull(),
  diagnosis: text("diagnosis").notNull(),
  notes: text("notes").notNull().default(""),
  vitals: jsonb("vitals").notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  appointmentId: text("appointment_id"),
  date: text("date").notNull(),
  dueDate: text("due_date").notNull(),
  items: jsonb("items").notNull().default([]),
  status: text("status").notNull().default("pending"),
  paidAt: text("paid_at"),
});

export const labs = pgTable(
  "labs",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    test: text("test").notNull(),
    requestedOn: text("requested_on").notNull(),
    status: text("status").notNull().default("requested"),
    result: text("result"),
    /* Lab-order workflow extension (additive; `status` stays in sync for the legacy UI) */
    /** ordered → awaiting_sample → sample_collected → processing → result_ready → verified → cancelled */
    workflow: text("workflow").notNull().default("ordered"),
    /** routine | urgent | stat */
    priority: text("priority").notNull().default("routine"),
    visitId: text("visit_id"),
    clinicalNote: text("clinical_note").notNull().default(""),
    sampleCollectedAt: text("sample_collected_at"),
    processedAt: text("processed_at"),
    processedBy: text("processed_by"),
    verifiedBy: text("verified_by"),
    verifiedByName: text("verified_by_name").notNull().default(""),
    verifiedAt: text("verified_at"),
    cancelledReason: text("cancelled_reason").notNull().default(""),
    /** client-supplied idempotency key — an identical resubmission returns the same order */
    idemKey: text("idem_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    labsPatientIdx: index("labs_patient_idx").on(t.patientId, t.requestedOn),
    labsIdemIdx: uniqueIndex("labs_idem_idx").on(t.idemKey),
  })
);

export const wards = pgTable("wards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  floor: integer("floor").notNull(),
  rooms: jsonb("rooms").notNull().default([]),
});

export type AccountRow = typeof accounts.$inferSelect;
export type PatientRow = typeof patients.$inferSelect;
export type DoctorRow = typeof doctors.$inferSelect;
export type AppointmentRow = typeof appointments.$inferSelect;
export type PrescriptionRow = typeof prescriptions.$inferSelect;
export type VisitRow = typeof visits.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type LabRow = typeof labs.$inferSelect;
export type WardRow = typeof wards.$inferSelect;

/* ─────────────── Pharmacy: medication orders (one row per ordered medication) ─────────────── */

export type MedicationOrderStatus =
  | "pending_review"
  | "verified"
  | "dispensing"
  | "dispensed"
  | "clarification_required"
  | "on_hold"
  | "cancelled";

export const medicationOrders = pgTable(
  "medication_orders",
  {
    id: text("id").primaryKey(), // MO-XXXXXX
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    visitId: text("visit_id"),
    prescriptionId: text("prescription_id"),
    drug: text("drug").notNull(),
    dosage: text("dosage").notNull().default(""),
    /** oral | iv | im | sc | topical | inhaled | sublingual | rectal | ocular | other */
    route: text("route").notNull().default("oral"),
    frequency: text("frequency").notNull().default(""),
    durationDays: integer("duration_days").notNull().default(0),
    quantity: integer("quantity").notNull().default(0),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("pending_review"),
    verifiedBy: text("verified_by"),
    verifiedByName: text("verified_by_name").notNull().default(""),
    verifiedAt: text("verified_at"),
    dispensedBy: text("dispensed_by"),
    dispensedByName: text("dispensed_by_name").notNull().default(""),
    dispensedAt: text("dispensed_at"),
    noteFromPharmacy: text("note_from_pharmacy").notNull().default(""),
    /** client-supplied idempotency key — duplicate submits reuse the same row */
    idemKey: text("idem_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index("medication_orders_patient_idx").on(t.patientId, t.createdAt),
    statusIdx: index("medication_orders_status_idx").on(t.status),
    idemIdx: uniqueIndex("medication_orders_idem_idx").on(t.idemKey),
  })
);

export type MedicationOrderRow = typeof medicationOrders.$inferSelect;

/* ─────────────── Admissions (inpatient stays, linked to beds) ─────────────── */

export const admissions = pgTable(
  "admissions",
  {
    id: text("id").primaryKey(), // AD-XXXXXX
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id"),
    wardId: text("ward_id").notNull().default(""),
    wardName: text("ward_name").notNull().default(""),
    bedId: text("bed_id"),
    bedLabel: text("bed_label").notNull().default(""),
    reason: text("reason").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("active"), // active | discharged
    admittedAt: text("admitted_at").notNull(), // ISO timestamp
    dischargedAt: text("discharged_at"), // ISO timestamp
    accountId: text("account_id"),
  },
  (t) => ({
    patientIdx: index("admissions_patient_idx").on(t.patientId, t.admittedAt),
    statusIdx: index("admissions_status_idx").on(t.status),
  })
);

export type AdmissionRow = typeof admissions.$inferSelect;

/* ─────────────── Normalized billing: billable items per order ─────────────── */

/**
 * One billable item per source order (medication / lab / consultation).
 * Uniqueness on (sourceType, sourceOrderId) makes duplicate submissions safe:
 * the second request resolves to the existing item instead of double-charging.
 * (sourceOrderId is null for manually-entered invoice lines, which are exempt.)
 */
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: text("id").primaryKey(), // II-XXXXXX
    invoiceId: text("invoice_id").notNull(),
    patientId: text("patient_id").notNull(),
    sourceType: text("source_type").notNull(), // medication | lab | consultation | manual
    sourceOrderId: text("source_order_id"),
    label: text("label").notNull(),
    /** internal billing code, e.g. MED-PARACETAMOL-500 — informational */
    code: text("code").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: real("unit_price").notNull().default(0),
    amount: real("amount").notNull().default(0),
    /** billed | awaiting_price | cancelled */
    status: text("status").notNull().default("billed"),
    currency: text("currency").notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    invoiceIdx: index("invoice_items_invoice_idx").on(t.invoiceId),
    sourceIdx: uniqueIndex("invoice_items_source_idx").on(t.sourceType, t.sourceOrderId),
  })
);

export type InvoiceItemRow = typeof invoiceItems.$inferSelect;

/* ─────────────── Pharmacy inventory (real stock, never invented) ─────────────── */

export const inventory = pgTable(
  "inventory",
  {
    id: text("id").primaryKey(), // INV-XXXX
    /** medication product name — orders resolve price & stock against it */
    name: text("name").notNull(),
    unit: text("unit").notNull().default("strip"),
    unitPrice: real("unit_price").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(10),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex("inventory_name_idx").on(t.name),
  })
);

export type InventoryRow = typeof inventory.$inferSelect;

/* ─────────────── Service prices (configurable; billing never invents prices) ─────────────── */

export const servicePrices = pgTable(
  "service_prices",
  {
    id: text("id").primaryKey(), // SP-XXXX
    kind: text("kind").notNull(), // medication | lab
    name: text("name").notNull(),
    unitPrice: real("unit_price").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindNameIdx: uniqueIndex("service_prices_kind_name_idx").on(t.kind, t.name),
  })
);

export type ServicePriceRow = typeof servicePrices.$inferSelect;

/** Doctor leave days — booking is rejected for any date within a leave. */
export const leaves = pgTable(
  "leaves",
  {
    id: text("id").primaryKey(),
    doctorId: text("doctor_id").notNull(),
    fromDate: text("from_date").notNull(), // ISO yyyy-mm-dd (inclusive)
    toDate: text("to_date").notNull(), // ISO yyyy-mm-dd (inclusive)
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("approved"), // approved | pending | denied
    requestedOn: text("requested_on").notNull(),
  },
  (t) => ({
    doctorIdx: index("leaves_doctor_idx").on(t.doctorId, t.fromDate),
  })
);

export type LeaveRow = typeof leaves.$inferSelect;

/* ─────────────── Emergency Center ─────────────── */

export const emergencyCases = pgTable(
  "emergency_cases",
  {
    id: text("id").primaryKey(), // EM-XXXXXX
    accountId: text("account_id").notNull(), // staff who registered it
    patientId: text("patient_id"), // existing registered patient, if found
    walkIn: jsonb("walk_in").notNull().default({}), // { name, age, gender, contactName, contactPhone }
    symptoms: text("symptoms").notNull().default(""),
    vitals: jsonb("vitals"), // EmergencyVitals | null
    notes: text("notes").notNull().default(""),
    trauma: boolean("trauma").notNull().default(false),
    priority: text("priority").notNull().default("MODERATE"), // final staff-confirmed
    triage: jsonb("triage"), // TriageResult | null
    triageAt: text("triage_at"),
    confirmedAt: text("confirmed_at"),
    reviewer: text("reviewer"),
    reasonForChange: text("reason_for_change"),
    assignedDoctorId: text("assigned_doctor_id"),
    department: text("department").notNull().default(""),
    status: text("status").notNull().default("arrived"),
    bedId: text("bed_id"),
    arrivalAt: text("arrival_at").notNull(), // ISO timestamp
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    statusIdx: index("emergency_status_idx").on(t.status, t.priority),
  })
);

export type EmergencyCaseRow = typeof emergencyCases.$inferSelect;

/* ─────────────── Smart Bed Management ─────────────── */

/** Live bed inventory — one row per physical bed, seeded from wards on boot. */
export const beds = pgTable(
  "beds",
  {
    id: text("id").primaryKey(), // matches the ward room bed id
    label: text("label").notNull(),
    wardId: text("ward_id").notNull(),
    wardName: text("ward_name").notNull().default(""),
    floor: integer("floor").notNull().default(0),
    roomId: text("room_id").notNull(),
    roomLabel: text("room_label").notNull().default(""),
    type: text("type").notNull().default("private"), // private | semi-private | icu
    status: text("status").notNull().default("available"),
    patientId: text("patient_id"),
    occupiedSince: text("occupied_since"),
    reservedFor: text("reserved_for"), // emergency case id
    reservedAt: text("reserved_at"),
    lastStatusChange: text("last_status_change").notNull(), // ISO timestamp
  },
  (t) => ({
    wardIdx: index("beds_ward_idx").on(t.wardId, t.status),
  })
);

export type BedRow = typeof beds.$inferSelect;

/** Every bed state transition, for the audit trail. */
export const bedAudit = pgTable(
  "bed_audit",
  {
    id: text("id").primaryKey(),
    bedId: text("bed_id").notNull(),
    bedLabel: text("bed_label").notNull().default(""),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").notNull(),
    changedByName: text("changed_by_name").notNull().default(""),
    reason: text("reason"),
    at: text("at").notNull(), // ISO timestamp
  },
  (t) => ({
    bedIdx: index("bed_audit_bed_idx").on(t.bedId, t.at),
  })
);

export type BedAuditRow = typeof bedAudit.$inferSelect;

/* ─────────────── Symptom Assessments (NLP intake) ─────────────── */

/**
 * One submitted symptom-intake assessment. The raw patient-confirmed
 * transcript is stored verbatim (edit history preserved as `finalText`);
 * inferences are stored with their engine version so the routing logic can
 * be audited/regraded later. Never reused as training data without consent.
 */
export const symptomAssessments = pgTable(
  "symptom_assessments",
  {
    id: text("id").primaryKey(), // SA-XXXXXX
    patientId: text("patient_id").notNull(), // required: accounts.patientId unless staff-supplied
    doctorId: text("doctor_id"), // recommended doctor, if any matched
    /** patient-confirmed text, verbatim */
    transcript: text("transcript").notNull(),
    /** true if voice input was used for the initial draft */
    inputMode: text("input_mode").notNull().default("text"), // text | voice
    /** structured, negation-aware extraction */
    extracted: jsonb("extracted").notNull().default({}),
    suggestedDepartment: text("suggested_department").notNull(),
    alternativeDepartments: jsonb("alternative_departments").notNull().default([]),
    urgency: text("urgency").notNull().default("routine"), // emergency | urgent | routine
    urgencyNote: text("urgency_note").notNull().default(""),
    followUpQuestions: jsonb("follow_up_questions").notNull().default([]),
    /** engine name + version, e.g. "carepulse-router-v2" */
    engine: text("engine").notNull(),
    /** clinician review outcome (filled later by staff) */
    reviewOutcome: text("review_outcome"), // agreed | changed | dismissed | null
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index("symptom_assessments_patient_idx").on(t.patientId, t.createdAt),
  })
);

export type SymptomAssessmentRow = typeof symptomAssessments.$inferSelect;

/* ─────────────── Audit log (sensitive-record access & changes) ─────────────── */

/** Who viewed or changed what. Clinical pages call /api/audit on open. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull().default(""),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(), // view | create | update | delete | login | logout
    entity: text("entity").notNull(), // e.g. "patient-history", "symptom-assessment", "bed"
    entityId: text("entity_id"),
    detail: text("detail").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_logs_entity_idx").on(t.entity, t.entityId),
    actorIdx: index("audit_logs_actor_idx"),
  })
);

export type AuditLogRow = typeof auditLogs.$inferSelect;

/* ─────────────── OPD Queue & tokens ─────────────── */

/**
 * One queue entry per patient per doctor-session. Token numbers are allocated
 * per doctor per clinic-day by the server; live status drives the patient
 * portal, the doctor waiting queue and the public waiting-room display
 * (which must never show patient names or any clinical data).
 */
export const queueEntries = pgTable(
  "queue_entries",
  {
    id: text("id").primaryKey(), // QE-XXXXXX
    queueDate: text("queue_date").notNull(), // yyyy-mm-dd — the clinic session day
    doctorId: text("doctor_id").notNull(),
    department: text("department").notNull().default(""),
    patientId: text("patient_id").notNull(),
    appointmentId: text("appointment_id"),
    /** appointment | walk_in | emergency */
    source: text("source").notNull().default("appointment"),
    /** normal | emergency — emergency always jumps the queue, server-enforced */
    priority: text("priority").notNull().default("normal"),
    /** waiting | called | done | missed | cancelled */
    status: text("status").notNull().default("waiting"),
    tokenNo: integer("token_no").notNull(),
    note: text("note").notNull().default(""), // visit reason / triage note from the issuer
    /** doctor's review note from the live triage file (feature 6) */
    reviewNote: text("review_note"),
    calledBy: text("called_by"),
    calledByName: text("called_by_name").notNull().default(""),
    calledAt: text("called_at"),
    /** duplicate prevention: one submission = one entry even across network retries */
    idemKey: text("idem_key"),
    registeredBy: text("registered_by"), // account id of the issuing staff member
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    doctorDayIdx: uniqueIndex("queue_entries_token_idx").on(t.queueDate, t.doctorId, t.tokenNo),
    /** one still-active entry per patient per doctor per day — no duplicate tokens */
    activeUniq: uniqueIndex("queue_entries_active_uniq")
      .on(t.queueDate, t.doctorId, t.patientId)
      .where(sql`status in ('waiting','called')`),
    patientIdx: index("queue_entries_patient_idx").on(t.patientId, t.queueDate),
    statusIdx: index("queue_entries_status_idx").on(t.queueDate, t.doctorId, t.status),
    idemIdx: uniqueIndex("queue_entries_idem_idx").on(t.idemKey),
  })
);

export type QueueEntryRow = typeof queueEntries.$inferSelect;

/* ─────────────── Payments (gateway: Razorpay-compatible) ─────────────── */

/**
 * Server-side payment records. Real gateway orders live here; the frontend
 * is never trusted — status changes only through signature-verified
 * callbacks (checkout verify or webhooks).
 */
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(), // PAY-XXXXXX
    provider: text("provider").notNull().default("razorpay"),
    /** gateway order id (razorpay order_xxx) */
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    patientId: text("patient_id").notNull(),
    appointmentId: text("appointment_id"),
    amount: real("amount").notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    /** created | paid | failed | refunded | cancelled */
    status: text("status").notNull().default("created"),
    /** append-only gateway event log (idempotent webhook processing) */
    events: jsonb("events").notNull().default([]),
    idemKey: text("idem_key"),
    failureReason: text("failure_reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerOrderIdx: uniqueIndex("payments_provider_order_idx").on(t.providerOrderId),
    patientIdx: index("payments_patient_idx").on(t.patientId, t.createdAt),
    idemIdx: uniqueIndex("payments_idem_idx").on(t.idemKey),
  })
);

export type PaymentRow = typeof payments.$inferSelect;

/* ─────────────── Recovery & wellness tracker ─────────────── */

/**
 * Clinician-authored recovery plan for a discharged patient. Only
 * doctor/admin accounts can create or amend plans; the patient logs their
 * own progress against it. Nothing is invented: an empty plan shows empty
 * states, and no predicted recovery dates are stored.
 */
export const recoveryPlans = pgTable(
  "recovery_plans",
  {
    id: text("id").primaryKey(), // RP-XXXXXX
    patientId: text("patient_id").notNull(),
    admissionId: text("admission_id"),
    visitId: text("visit_id"),
    dischargeAt: text("discharge_at").notNull(), // ISO timestamp
    /** clinician-approved instructions / tasks / measurement requests */
    instructions: jsonb("instructions").notNull().default([]),
    /** clinician-approved escalation rules — explicit red-flag phrases */
    redFlags: jsonb("red_flags").notNull().default([]),
    version: integer("version").notNull().default(1),
    createdById: text("created_by_id").notNull(),
    createdByName: text("created_by_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index("recovery_plans_patient_idx").on(t.patientId, t.createdAt),
  })
);

export type RecoveryPlanRow = typeof recoveryPlans.$inferSelect;

/** Patient-recorded progress against a recovery plan. */
export const recoveryLogs = pgTable(
  "recovery_logs",
  {
    id: text("id").primaryKey(), // RL-XXXXXX
    planId: text("plan_id").notNull(),
    patientId: text("patient_id").notNull(),
    /** progress | symptom | measurement | task_done */
    type: text("type").notNull(),
    content: text("content").notNull().default(""),
    metricName: text("metric_name").notNull().default(""),
    metricValue: text("metric_value").notNull().default(""),
    /** escalation-rule matches computed server-side at write time */
    flags: jsonb("flags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planIdx: index("recovery_logs_plan_idx").on(t.planId, t.createdAt),
    patientIdx: index("recovery_logs_patient_idx").on(t.patientId, t.createdAt),
  })
);

export type RecoveryLogRow = typeof recoveryLogs.$inferSelect;

/* ─────────────── ABDM / ABHA (integration-ready layer) ─────────────── */

/**
 * ABHA linkage records. Numbers/addresses come ONLY from what the patient
 * provides (QR/manual) — nothing is generated. Every record is explicitly
 * unverified until an authorized ABDM gateway confirms it.
 */
export const abhaLinks = pgTable(
  "abha_links",
  {
    id: text("id").primaryKey(), // AB-XXXXXX
    patientId: text("patient_id").notNull(),
    abhaNumber: text("abha_number").notNull().default(""),
    abhaAddress: text("abha_address").notNull().default(""),
    /** pending | linked | revoked | rejected */
    status: text("status").notNull().default("pending"),
    method: text("method").notNull().default(""), // qr_scan | manual_entry | gateway
    note: text("note").notNull().default(""),
    verifiedAt: text("verified_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index("abha_links_patient_idx").on(t.patientId),
  })
);

export type AbhaLinkRow = typeof abhaLinks.$inferSelect;

/** Consent records for health-information exchange (ABDM consent artefacts). */
export const abdmConsents = pgTable(
  "abdm_consents",
  {
    id: text("id").primaryKey(), // AC-XXXXXX
    patientId: text("patient_id").notNull(),
    purpose: text("purpose").notNull(),
    hiTypes: jsonb("hi_types").notNull().default([]),
    rangeFrom: text("range_from").notNull().default(""),
    rangeTo: text("range_to").notNull().default(""),
    /** requested | granted | revoked | expired | rejected */
    status: text("status").notNull().default("requested"),
    gatewayRef: text("gateway_ref").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    patientIdx: index("abdm_consents_patient_idx").on(t.patientId, t.createdAt),
  })
);

export type AbdmConsentRow = typeof abdmConsents.$inferSelect;

/* ─────────────── Lab report files (PDF uploads) ─────────────── */

/**
 * Uploaded PDF lab reports, stored BLOB inside Postgres (no public URL, no
 * global signed link). Download is authorized server-side per request and
 * audited; files link to exactly one lab order.
 */
export const labReportFiles = pgTable(
  "lab_report_files",
  {
    id: text("id").primaryKey(), // LF-XXXXXX
    labId: text("lab_id").notNull(),
    patientId: text("patient_id").notNull(),
    visitId: text("visit_id"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull().default("application/pdf"),
    size: integer("size").notNull().default(0),
    data: text("data").notNull(), // base64-encoded PDF bytes
    uploadedBy: text("uploaded_by").notNull(),
    uploadedByName: text("uploaded_by_name").notNull().default(""),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    /** pending_review | reviewed */
    reviewStatus: text("review_status").notNull().default("pending_review"),
    reviewedBy: text("reviewed_by"),
    reviewedByName: text("reviewed_by_name").notNull().default(""),
    reviewedAt: text("reviewed_at"),
  },
  (t) => ({
    labIdx: index("lab_report_files_lab_idx").on(t.labId),
  })
);

export type LabReportFileRow = typeof labReportFiles.$inferSelect;
