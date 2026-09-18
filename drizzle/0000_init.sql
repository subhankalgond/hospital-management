-- CarePulse initial schema (canonical; generated for drizzle-kit and also
-- auto-applied by the dev PGlite fallback on first run).

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "salt" text,
  "hash_algo" text DEFAULT 'scrypt' NOT NULL,
  "patient_id" text,
  "doctor_id" text,
  "created_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_idx" ON "accounts" ("email");

CREATE TABLE IF NOT EXISTS "sessions" (
  "token" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "patients" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "dob" text DEFAULT '' NOT NULL,
  "gender" text DEFAULT 'other' NOT NULL,
  "blood_group" text DEFAULT '' NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "emergency_contact" jsonb DEFAULT '{"name":"","phone":"","relation":""}'::jsonb NOT NULL,
  "allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "immunizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "insurance" jsonb DEFAULT '{"provider":"","number":""}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "doctors" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "qualification" text DEFAULT '' NOT NULL,
  "license_no" text DEFAULT '' NOT NULL,
  "specialty" text NOT NULL,
  "department" text NOT NULL,
  "email" text NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "room" text DEFAULT '—' NOT NULL,
  "experience_years" integer DEFAULT 0 NOT NULL,
  "rating" real DEFAULT 0 NOT NULL,
  "on_call" boolean DEFAULT false NOT NULL,
  "shift" text DEFAULT 'morning' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "appointments" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL,
  "doctor_id" text NOT NULL,
  "date" text NOT NULL,
  "time" text NOT NULL,
  "duration_min" integer DEFAULT 30 NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'confirmed' NOT NULL,
  "queue_status" text,
  "notes" text,
  "created_at" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "appointments_slot_idx" ON "appointments" ("doctor_id", "date", "time");

CREATE TABLE IF NOT EXISTS "prescriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL,
  "doctor_id" text NOT NULL,
  "date" text NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "visits" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL,
  "doctor_id" text NOT NULL,
  "date" text NOT NULL,
  "department" text NOT NULL,
  "diagnosis" text NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "vitals" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL,
  "appointment_id" text,
  "date" text NOT NULL,
  "due_date" text NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "paid_at" text
);

CREATE TABLE IF NOT EXISTS "labs" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL,
  "doctor_id" text NOT NULL,
  "test" text NOT NULL,
  "requested_on" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "result" text
);

CREATE TABLE IF NOT EXISTS "wards" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "floor" integer NOT NULL,
  "rooms" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "leaves" (
  "id" text PRIMARY KEY NOT NULL,
  "doctor_id" text NOT NULL,
  "from_date" text NOT NULL,
  "to_date" text NOT NULL,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'approved' NOT NULL,
  "requested_on" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "leaves_doctor_idx" ON "leaves" ("doctor_id", "from_date");
