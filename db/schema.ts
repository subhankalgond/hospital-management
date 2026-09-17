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
