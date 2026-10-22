export type Role = "patient" | "doctor" | "admin" | "pharmacy" | "lab";

/** A registered user: credentials + a link to their role profile. */
export interface Account {
  id: string;
  role: Role;
  name: string;
  email: string;
  /** salted SHA-256, hex encoded */
  passwordHash: string;
  salt: string;
  createdAt: string; // ISO date
  /** for patients */
  patientId?: string;
  /** for doctors */
  doctorId?: string;
}

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  avatarHue: number;
  /** for patients */
  patientId?: string;
  /** for doctors */
  doctorId?: string;
}

export interface Patient {
  id: string;
  /** permanent hospital identifier, e.g. PAT-2026-000001 — assigned once by the server */
  patientCode: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  gender: "male" | "female" | "other";
  bloodGroup: string;
  address: string;
  emergencyContact: { name: string; phone: string; relation: string };
  allergies: string[];
  conditions: string[];
  immunizations: { name: string; date: string }[];
  insurance: { provider: string; number: string };
}

export interface Doctor {
  id: string;
  name: string;
  /** medical qualification, e.g. "MBBS, MD (Cardiology)" */
  qualification: string;
  /** medical license / registration number */
  licenseNo: string;
  specialty: string;
  department: string;
  email: string;
  phone: string;
  room: string;
  experienceYears: number;
  rating: number;
  onCall: boolean;
  shift: "morning" | "evening" | "night";
}

export type SignUpInputBase = {
  name: string;
  email: string;
  password: string;
};

/** Pharmacy / laboratory staff self-registration. */
export type SignUpStaffInput = SignUpInputBase & {
  role: "pharmacy" | "lab";
  phone: string;
};

export type SignUpPatientInput = SignUpInputBase & {
  role: "patient";
  phone: string;
  dob: string;
  gender: Patient["gender"];
};

export type SignUpDoctorInput = SignUpInputBase & {
  role: "doctor";
  phone: string;
  qualification: string;
  licenseNo: string;
  specialty: string;
  department: string;
  experienceYears: number;
  shift: Doctor["shift"];
  room?: string;
};

export type SignUpAdminInput = SignUpInputBase & {
  role: "admin";
  accessCode: string;
};

export type SignUpInput = SignUpPatientInput | SignUpDoctorInput | SignUpAdminInput | SignUpStaffInput;

export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no-show";
export type VisitStatus = "waiting" | "in-progress" | "completed";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // HH:mm 24h
  durationMin: number;
  reason: string;
  status: AppointmentStatus;
  /** live queue state for today's appointments (doctor view) */
  queueStatus?: VisitStatus;
  notes?: string;
  createdAt: number;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  items: { drug: string; dosage: string; frequency: string; durationDays: number; instructions?: string }[];
  active: boolean;
}

export interface Visit {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  department: string;
  diagnosis: string;
  notes: string;
  vitals: { bp: string; hr: number; tempC: number; spo2: number; weightKg: number };
}

export type InvoiceStatus = "paid" | "pending" | "overdue";

export interface Invoice {
  id: string;
  patientId: string;
  appointmentId?: string;
  date: string;
  dueDate: string;
  items: { label: string; amount: number }[];
  status: InvoiceStatus;
  paidAt?: string;
}

export type LabStatus = "requested" | "in-progress" | "resulted";

/** Detailed lab workflow, tracked alongside the legacy `status` field. */
export type LabWorkflow =
  | "ordered"
  | "awaiting_sample"
  | "sample_collected"
  | "processing"
  | "result_ready"
  | "verified"
  | "cancelled";

export interface LabRequest {
  id: string;
  patientId: string;
  doctorId: string;
  test: string;
  requestedOn: string;
  status: LabStatus;
  result?: string;
  workflow?: LabWorkflow;
  priority?: "routine" | "urgent" | "stat";
  visitId?: string | null;
  clinicalNote?: string;
  sampleCollectedAt?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  verifiedBy?: string | null;
  verifiedByName?: string;
  verifiedAt?: string | null;
  cancelledReason?: string;
}

/* ─────────────── Pharmacy medication orders ─────────────── */

export type MedicationOrderStatus =
  | "pending_review"
  | "verified"
  | "dispensing"
  | "dispensed"
  | "clarification_required"
  | "on_hold"
  | "cancelled";

export interface MedicationOrder {
  id: string;
  patientId: string;
  doctorId: string;
  visitId?: string | null;
  prescriptionId?: string | null;
  drug: string;
  dosage: string;
  route: string;
  frequency: string;
  durationDays: number;
  quantity: number;
  instructions: string;
  status: MedicationOrderStatus;
  verifiedBy?: string | null;
  verifiedByName?: string;
  verifiedAt?: string | null;
  dispensedBy?: string | null;
  dispensedByName?: string;
  dispensedAt?: string | null;
  noteFromPharmacy?: string;
  createdAt: string; // ISO
}

export interface Admission {
  id: string;
  patientId: string;
  doctorId?: string | null;
  wardId: string;
  wardName: string;
  bedId?: string | null;
  bedLabel: string;
  reason: string;
  notes: string;
  status: "active" | "discharged";
  admittedAt: string; // ISO timestamp
  dischargedAt?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  patientId: string;
  sourceType: "medication" | "lab" | "consultation" | "manual";
  sourceOrderId?: string | null;
  label: string;
  code?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  status: "billed" | "awaiting_price" | "cancelled";
  currency: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  stock: number;
  reorderLevel: number;
}

export interface ServicePrice {
  id: string;
  kind: "medication" | "lab";
  name: string;
  unitPrice: number;
}

export interface SymptomAssessmentRow {
  id: string;
  patientId: string;
  doctorId?: string | null;
  transcript: string;
  inputMode: "text" | "voice";
  extracted: Record<string, unknown>;
  suggestedDepartment: string;
  alternativeDepartments?: string[];
  urgency: "emergency" | "urgent" | "routine";
  urgencyNote: string;
  engine: string;
  reviewOutcome?: "agreed" | "changed" | "dismissed" | null;
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface Bed {
  id: string;
  label: string;
  patientId?: string;
  since?: string;
}

export interface Room {
  id: string;
  label: string;
  type: "private" | "semi-private" | "icu";
  beds: Bed[];
}

export interface Ward {
  id: string;
  name: string;
  floor: number;
  rooms: Room[];
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

/** Doctor leave — blocks bookings on the covered days. */
export type LeaveStatus = "approved" | "pending" | "denied";

export interface Leave {
  id: string;
  doctorId: string;
  fromDate: string; // ISO yyyy-mm-dd (inclusive)
  toDate: string; // ISO yyyy-mm-dd (inclusive)
  reason: string;
  status: LeaveStatus;
  requestedOn: string; // ISO date the leave was requested
}

/* ─────────────── Emergency Center (AI-assisted triage) ─────────────── */

export type EmergencyPriority = "CRITICAL" | "URGENT" | "MODERATE" | "LOW";

export const PRIORITY_ORDER: EmergencyPriority[] = ["CRITICAL", "URGENT", "MODERATE", "LOW"];

export type EmergencyStatus =
  | "arrived"
  | "triage-pending"
  | "triaged"
  | "waiting"
  | "in-assessment"
  | "in-treatment"
  | "admitted"
  | "transferred"
  | "discharged"
  | "closed";

export type ConsciousnessLevel = "alert" | "verbal" | "pain" | "unresponsive";

export interface EmergencyVitals {
  hr: number; // BPM
  bp: string; // "120/80" mmHg
  spo2: number; // %
  rr: number; // /min respiratory rate
  tempC: number; // °C
  glucose: number; // mg/dL
  consciousness: ConsciousnessLevel;
}

export interface TriageResult {
  aiPriority: EmergencyPriority;
  riskIndicators: string[];
  recommendation: string;
  reasoning: string;
  /** true — this engine is a transparent rule-based demo, not a medical model */
  demoMode: true;
  ranAt: string; // ISO timestamp
}

export interface EmergencyCase {
  id: string;
  accountId: string; // staff member who registered the case
  /** link to an existing registered patient, when found */
  patientId?: string;
  /** walk-in patient details when no registered patient exists */
  walkIn?: {
    name: string;
    age: number;
    gender: "male" | "female" | "other";
    contactName: string;
    contactPhone: string;
  };
  symptoms: string;
  vitals: EmergencyVitals | null;
  notes: string;
  trauma: boolean;
  priority: EmergencyPriority; // final (staff-confirmed) priority
  triage: TriageResult | null;
  triageAt?: string;
  confirmedAt?: string;
  reviewer?: string;
  reasonForChange?: string;
  assignedDoctorId?: string;
  department: string;
  status: EmergencyStatus;
  bedId?: string; // set when admitted
  arrivalAt: string; // ISO timestamp
  updatedAt: string;
}

/* ─────────────── Smart Bed Management ─────────────── */

export type BedStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "discharge-pending"
  | "cleaning"
  | "inspection"
  | "maintenance";

export interface BedState {
  id: string;
  label: string;
  wardId: string;
  wardName: string;
  floor: number;
  roomId: string;
  roomLabel: string;
  type: "private" | "semi-private" | "icu";
  status: BedStatus;
  patientId?: string;
  occupiedSince?: string;
  reservedFor?: string; // emergency case id
  reservedAt?: string;
  lastStatusChange: string; // ISO timestamp
}

export interface BedAuditEntry {
  id: string;
  bedId: string;
  bedLabel: string;
  fromStatus: BedStatus;
  toStatus: BedStatus;
  changedBy: string;
  changedByName: string;
  reason?: string;
  at: string; // ISO timestamp
}
