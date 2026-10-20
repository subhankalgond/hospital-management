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

export const patients = pgTable("patients", {
  id: text("id").primaryKey(),
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
});

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

export const labs = pgTable("labs", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  doctorId: text("doctor_id").notNull(),
  test: text("test").notNull(),
  requestedOn: text("requested_on").notNull(),
  status: text("status").notNull().default("requested"),
  result: text("result"),
});

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
