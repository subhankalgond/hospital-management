export type Role = "patient" | "doctor" | "admin";

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

export type SignUpInput = SignUpPatientInput | SignUpDoctorInput | SignUpAdminInput;

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

export interface LabRequest {
  id: string;
  patientId: string;
  doctorId: string;
  test: string;
  requestedOn: string;
  status: LabStatus;
  result?: string;
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
