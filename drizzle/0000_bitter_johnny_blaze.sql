CREATE TABLE "accounts" (
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
--> statement-breakpoint
CREATE TABLE "appointments" (
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
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bed_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"bed_id" text NOT NULL,
	"bed_label" text DEFAULT '' NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_by_name" text DEFAULT '' NOT NULL,
	"reason" text,
	"at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beds" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"ward_id" text NOT NULL,
	"ward_name" text DEFAULT '' NOT NULL,
	"floor" integer DEFAULT 0 NOT NULL,
	"room_id" text NOT NULL,
	"room_label" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"patient_id" text,
	"occupied_since" text,
	"reserved_for" text,
	"reserved_at" text,
	"last_status_change" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
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
--> statement-breakpoint
CREATE TABLE "emergency_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"patient_id" text,
	"walk_in" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"symptoms" text DEFAULT '' NOT NULL,
	"vitals" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"trauma" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'MODERATE' NOT NULL,
	"triage" jsonb,
	"triage_at" text,
	"confirmed_at" text,
	"reviewer" text,
	"reason_for_change" text,
	"assigned_doctor_id" text,
	"department" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'arrived' NOT NULL,
	"bed_id" text,
	"arrival_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"appointment_id" text,
	"date" text NOT NULL,
	"due_date" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" text
);
--> statement-breakpoint
CREATE TABLE "labs" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"test" text NOT NULL,
	"requested_on" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"result" text
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"requested_on" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
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
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"date" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text,
	"transcript" text NOT NULL,
	"input_mode" text DEFAULT 'text' NOT NULL,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggested_department" text NOT NULL,
	"alternative_departments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"urgency" text DEFAULT 'routine' NOT NULL,
	"urgency_note" text DEFAULT '' NOT NULL,
	"follow_up_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine" text NOT NULL,
	"review_outcome" text,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"date" text NOT NULL,
	"department" text NOT NULL,
	"diagnosis" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"vitals" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"floor" integer NOT NULL,
	"rooms" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_idx" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "appointments_slot_idx" ON "appointments" USING btree ("doctor_id","date","time");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "bed_audit_bed_idx" ON "bed_audit" USING btree ("bed_id","at");--> statement-breakpoint
CREATE INDEX "beds_ward_idx" ON "beds" USING btree ("ward_id","status");--> statement-breakpoint
CREATE INDEX "emergency_status_idx" ON "emergency_cases" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "leaves_doctor_idx" ON "leaves" USING btree ("doctor_id","from_date");--> statement-breakpoint
CREATE INDEX "symptom_assessments_patient_idx" ON "symptom_assessments" USING btree ("patient_id","created_at");