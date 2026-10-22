CREATE TABLE "admissions" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text,
	"ward_id" text DEFAULT '' NOT NULL,
	"ward_name" text DEFAULT '' NOT NULL,
	"bed_id" text,
	"bed_label" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"admitted_at" text NOT NULL,
	"discharged_at" text,
	"account_id" text
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'strip' NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_order_id" text,
	"label" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'billed' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"visit_id" text,
	"prescription_id" text,
	"drug" text NOT NULL,
	"dosage" text DEFAULT '' NOT NULL,
	"route" text DEFAULT 'oral' NOT NULL,
	"frequency" text DEFAULT '' NOT NULL,
	"duration_days" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"verified_by" text,
	"verified_by_name" text DEFAULT '' NOT NULL,
	"verified_at" text,
	"dispensed_by" text,
	"dispensed_by_name" text DEFAULT '' NOT NULL,
	"dispensed_at" text,
	"note_from_pharmacy" text DEFAULT '' NOT NULL,
	"idem_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "workflow" text DEFAULT 'ordered' NOT NULL;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "priority" text DEFAULT 'routine' NOT NULL;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "visit_id" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "clinical_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "sample_collected_at" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "processed_at" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "processed_by" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "verified_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "verified_at" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "cancelled_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "idem_key" text;--> statement-breakpoint
ALTER TABLE "labs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "patient_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "admissions_patient_idx" ON "admissions" USING btree ("patient_id","admitted_at");--> statement-breakpoint
CREATE INDEX "admissions_status_idx" ON "admissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_name_idx" ON "inventory" USING btree ("name");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_items_source_idx" ON "invoice_items" USING btree ("source_type","source_order_id");--> statement-breakpoint
CREATE INDEX "medication_orders_patient_idx" ON "medication_orders" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "medication_orders_status_idx" ON "medication_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_orders_idem_idx" ON "medication_orders" USING btree ("idem_key");--> statement-breakpoint
CREATE UNIQUE INDEX "service_prices_kind_name_idx" ON "service_prices" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "labs_patient_idx" ON "labs" USING btree ("patient_id","requested_on");--> statement-breakpoint
CREATE UNIQUE INDEX "labs_idem_idx" ON "labs" USING btree ("idem_key");