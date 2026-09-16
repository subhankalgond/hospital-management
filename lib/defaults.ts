import type { Ward } from "./types";

/** Departments with their standard consultation fee (auto-invoiced on booking). */
export const DEPARTMENTS: { name: string; fee: number; specialties: string[] }[] = [
  { name: "Cardiology", fee: 180, specialties: ["Cardiologist", "Interventional Cardiologist"] },
  { name: "Pediatrics", fee: 150, specialties: ["Pediatrician", "Neonatologist"] },
  { name: "Dermatology", fee: 160, specialties: ["Dermatologist", "Cosmetic Dermatologist"] },
  { name: "Orthopedics", fee: 190, specialties: ["Orthopedic Surgeon", "Sports Medicine Specialist"] },
  { name: "Neurology", fee: 175, specialties: ["Neurologist", "Neurosurgeon"] },
  { name: "General Medicine", fee: 150, specialties: ["Internal Medicine", "Family Physician"] },
  { name: "Psychiatry", fee: 170, specialties: ["Psychiatrist"] },
  { name: "ENT", fee: 155, specialties: ["Otolaryngologist"] },
  { name: "Ophthalmology", fee: 160, specialties: ["Ophthalmologist"] },
  { name: "Gynecology", fee: 165, specialties: ["Gynecologist", "Obstetrician"] },
];

export const DEPARTMENT_NAMES = DEPARTMENTS.map((d) => d.name);

export function departmentFee(department: string) {
  return DEPARTMENTS.find((d) => d.name === department)?.fee ?? 150;
}

export const SHIFTS: DoctorShift[] = ["morning", "evening", "night"];
type DoctorShift = "morning" | "evening" | "night";

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** Admin signup is protected by an access code (client-side demo environment). */
export const ADMIN_ACCESS_CODE = "CAREPULSE-ADMIN-2026";

/**
 * Hospital infrastructure (kept across resets): ward structure with empty
 * beds, ready for real admissions from registered patients.
 */
export function initialWards(): Ward[] {
  return [
    {
      id: "w1", name: "General Care", floor: 2,
      rooms: [
        { id: "w1-r1", label: "201", type: "private", beds: [{ id: "w1-r1-b1", label: "201-A" }] },
        { id: "w1-r2", label: "202", type: "semi-private", beds: [{ id: "w1-r2-b1", label: "202-A" }, { id: "w1-r2-b2", label: "202-B" }] },
        { id: "w1-r3", label: "203", type: "semi-private", beds: [{ id: "w1-r3-b1", label: "203-A" }, { id: "w1-r3-b2", label: "203-B" }] },
        { id: "w1-r4", label: "204", type: "private", beds: [{ id: "w1-r4-b1", label: "204-A" }] },
      ],
    },
    {
      id: "w2", name: "Maternity", floor: 3,
      rooms: [
        { id: "w2-r1", label: "301", type: "private", beds: [{ id: "w2-r1-b1", label: "301-A" }] },
        { id: "w2-r2", label: "302", type: "private", beds: [{ id: "w2-r2-b1", label: "302-A" }] },
        { id: "w2-r3", label: "303", type: "semi-private", beds: [{ id: "w2-r3-b1", label: "303-A" }, { id: "w2-r3-b2", label: "303-B" }] },
      ],
    },
    {
      id: "w3", name: "Intensive Care", floor: 4,
      rooms: [
        { id: "w3-r1", label: "ICU-1", type: "icu", beds: [{ id: "w3-r1-b1", label: "ICU-1A" }] },
        { id: "w3-r2", label: "ICU-2", type: "icu", beds: [{ id: "w3-r2-b1", label: "ICU-2A" }] },
        { id: "w3-r3", label: "ICU-3", type: "icu", beds: [{ id: "w3-r3-b1", label: "ICU-3A" }] },
      ],
    },
  ];
}
