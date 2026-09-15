import type {
  Appointment,
  Doctor,
  Invoice,
  LabRequest,
  Patient,
  Prescription,
  StaffMember,
  User,
  Visit,
  Ward,
} from "./types";
import { addDays, todayISO } from "./utils";

const T = todayISO();
const D = (n: number) => addDays(T, n);

export const demoUsers: User[] = [
  { id: "u-patient", role: "patient", name: "Olivia Bennett", email: "olivia.bennett@mail.com", avatarHue: 280, patientId: "p1" },
  { id: "u-doctor", role: "doctor", name: "Dr. Sarah Chen", email: "s.chen@carepulse.org", avatarHue: 172, doctorId: "d1" },
  { id: "u-admin", role: "admin", name: "Marcus Webb", email: "m.webb@carepulse.org", avatarHue: 199 },
];

export const doctors: Doctor[] = [
  { id: "d1", name: "Dr. Sarah Chen", specialty: "Cardiologist", department: "Cardiology", email: "s.chen@carepulse.org", phone: "(555) 010-1201", room: "C-204", experienceYears: 12, rating: 4.9, onCall: true, shift: "morning" },
  { id: "d2", name: "Dr. James Okafor", specialty: "Pediatrician", department: "Pediatrics", email: "j.okafor@carepulse.org", phone: "(555) 010-1202", room: "P-101", experienceYears: 9, rating: 4.8, onCall: false, shift: "morning" },
  { id: "d3", name: "Dr. Amara Hassan", specialty: "Dermatologist", department: "Dermatology", email: "a.hassan@carepulse.org", phone: "(555) 010-1203", room: "D-310", experienceYears: 7, rating: 4.7, onCall: false, shift: "evening" },
  { id: "d4", name: "Dr. Miguel Reyes", specialty: "Orthopedic Surgeon", department: "Orthopedics", email: "m.reyes@carepulse.org", phone: "(555) 010-1204", room: "O-112", experienceYears: 15, rating: 4.9, onCall: true, shift: "evening" },
  { id: "d5", name: "Dr. Emily Tran", specialty: "Neurologist", department: "Neurology", email: "e.tran@carepulse.org", phone: "(555) 010-1205", room: "N-415", experienceYears: 11, rating: 4.6, onCall: false, shift: "morning" },
  { id: "d6", name: "Dr. David Kim", specialty: "Internal Medicine", department: "General Medicine", email: "d.kim@carepulse.org", phone: "(555) 010-1206", room: "M-220", experienceYears: 8, rating: 4.7, onCall: false, shift: "night" },
];

export const patients: Patient[] = [
  {
    id: "p1", name: "Olivia Bennett", email: "olivia.bennett@mail.com", phone: "(555) 234-8890", dob: "1989-03-14", gender: "female",
    bloodGroup: "O+", address: "418 Maple Grove Ln, Springfield", emergencyContact: { name: "Noah Bennett", phone: "(555) 234-1122", relation: "Husband" },
    allergies: ["Penicillin"], conditions: ["Mild asthma"], immunizations: [{ name: "Influenza", date: D(-210) }, { name: "COVID-19 booster", date: D(-400) }, { name: "Tetanus", date: D(-900) }],
    insurance: { provider: "BlueShield Plus", number: "BSP-88412-09" },
  },
  {
    id: "p2", name: "Liam Carter", email: "liam.carter@mail.com", phone: "(555) 311-4417", dob: "1975-11-02", gender: "male",
    bloodGroup: "A-", address: "77 Beacon Street, Riverton", emergencyContact: { name: "Grace Carter", phone: "(555) 311-9080", relation: "Wife" },
    allergies: [], conditions: ["Hypertension"], immunizations: [{ name: "Influenza", date: D(-180) }],
    insurance: { provider: "AetnaCare", number: "AC-22109-4" },
  },
  {
    id: "p3", name: "Maya Rodriguez", email: "maya.rodriguez@mail.com", phone: "(555) 902-7734", dob: "1996-07-21", gender: "female",
    bloodGroup: "B+", address: "1209 Sunview Ave, Lakeside", emergencyContact: { name: "Elena Rodriguez", phone: "(555) 902-1188", relation: "Mother" },
    allergies: ["Latex"], conditions: [], immunizations: [{ name: "HPV", date: D(-1200) }, { name: "Influenza", date: D(-160) }],
    insurance: { provider: "Unity Health", number: "UH-70333-2" },
  },
  {
    id: "p4", name: "Ethan Park", email: "ethan.park@mail.com", phone: "(555) 640-2210", dob: "1982-01-30", gender: "male",
    bloodGroup: "AB+", address: "5 Harborside Rd, Port Ellis", emergencyContact: { name: "Mina Park", phone: "(555) 640-7712", relation: "Sister" },
    allergies: ["Peanuts", "Sulfa drugs"], conditions: ["Type 2 diabetes"], immunizations: [{ name: "Hepatitis B", date: D(-1500) }],
    insurance: { provider: "BlueShield Plus", number: "BSP-11940-7" },
  },
  {
    id: "p5", name: "Sofia Nakamura", email: "sofia.nakamura@mail.com", phone: "(555) 118-9903", dob: "1993-09-08", gender: "female",
    bloodGroup: "O-", address: "306 Cherry Blossom Ct, Meadowbrook", emergencyContact: { name: "Ken Nakamura", phone: "(555) 118-2211", relation: "Father" },
    allergies: [], conditions: ["Migraine"], immunizations: [{ name: "COVID-19 booster", date: D(-380) }],
    insurance: { provider: "AetnaCare", number: "AC-55821-1" },
  },
  {
    id: "p6", name: "Noah Fitzgerald", email: "noah.fitzgerald@mail.com", phone: "(555) 765-3319", dob: "1968-05-19", gender: "male",
    bloodGroup: "A+", address: "12 Old Mill Way, Stoneham", emergencyContact: { name: "Ruth Fitzgerald", phone: "(555) 765-8823", relation: "Wife" },
    allergies: ["Aspirin"], conditions: ["Atrial fibrillation", "High cholesterol"], immunizations: [{ name: "Pneumococcal", date: D(-700) }, { name: "Influenza", date: D(-140) }],
    insurance: { provider: "MediGuard", number: "MG-41108-6" },
  },
  {
    id: "p7", name: "Ava Thompson", email: "ava.thompson@mail.com", phone: "(555) 220-6654", dob: "2001-12-11", gender: "female",
    bloodGroup: "B-", address: "990 Birchwood Dr, Northgate", emergencyContact: { name: "Dana Thompson", phone: "(555) 220-1190", relation: "Mother" },
    allergies: [], conditions: [], immunizations: [{ name: "HPV", date: D(-900) }, { name: "MMR", date: D(-7300) }],
    insurance: { provider: "Unity Health", number: "UH-90012-8" },
  },
  {
    id: "p8", name: "William Osei", email: "william.osei@mail.com", phone: "(555) 431-7789", dob: "1959-02-25", gender: "male",
    bloodGroup: "O+", address: "45 Crescent Heights, Brookfield", emergencyContact: { name: "Abena Osei", phone: "(555) 431-2201", relation: "Daughter" },
    allergies: ["Iodine"], conditions: ["Osteoarthritis", "Hypertension"], immunizations: [{ name: "Pneumococcal", date: D(-500) }, { name: "Influenza", date: D(-120) }],
    insurance: { provider: "MediGuard", number: "MG-33077-3" },
  },
  {
    id: "p9", name: "Isabella Moreau", email: "isabella.moreau@mail.com", phone: "(555) 977-1145", dob: "1991-06-17", gender: "female",
    bloodGroup: "AB-", address: "23 Vine Street, Hillcrest", emergencyContact: { name: "Luc Moreau", phone: "(555) 977-8834", relation: "Brother" },
    allergies: [], conditions: ["Hypothyroidism"], immunizations: [{ name: "COVID-19 booster", date: D(-350) }],
    insurance: { provider: "BlueShield Plus", number: "BSP-61205-5" },
  },
  {
    id: "p10", name: "Lucas Meyer", email: "lucas.meyer@mail.com", phone: "(555) 350-9987", dob: "1985-10-05", gender: "male",
    bloodGroup: "A+", address: "680 Aspen Loop, Fairfield", emergencyContact: { name: "Hannah Meyer", phone: "(555) 350-2214", relation: "Wife" },
    allergies: ["Bee stings"], conditions: ["Seasonal allergies"], immunizations: [{ name: "Tetanus", date: D(-1100) }],
    insurance: { provider: "AetnaCare", number: "AC-88990-9" },
  },
  {
    id: "p11", name: "Emma Lindqvist", email: "emma.lindqvist@mail.com", phone: "(555) 806-4471", dob: "1979-04-27", gender: "female",
    bloodGroup: "B+", address: "154 Fjord Lane, Westbrook", emergencyContact: { name: "Erik Lindqvist", phone: "(555) 806-1123", relation: "Husband" },
    allergies: [], conditions: ["Anemia"], immunizations: [{ name: "Influenza", date: D(-200) }],
    insurance: { provider: "Unity Health", number: "UH-44051-4" },
  },
  {
    id: "p12", name: "Mia Conti", email: "mia.conti@mail.com", phone: "(555) 669-3325", dob: "1998-08-30", gender: "female",
    bloodGroup: "O+", address: "38 Terrazza Way, Sunfield", emergencyContact: { name: "Luca Conti", phone: "(555) 669-9910", relation: "Father" },
    allergies: ["Lactose"], conditions: [], immunizations: [{ name: "COVID-19 primary", date: D(-1400) }],
    insurance: { provider: "MediGuard", number: "MG-70112-2" },
  },
];

export const appointments: Appointment[] = [
  // ── past week (history) ──
  { id: "a01", patientId: "p1", doctorId: "d1", date: D(-21), time: "10:00", durationMin: 30, reason: "Annual cardiology check-up", status: "completed", createdAt: 1 },
  { id: "a02", patientId: "p2", doctorId: "d1", date: D(-14), time: "09:30", durationMin: 30, reason: "Blood pressure review", status: "completed", createdAt: 2 },
  { id: "a03", patientId: "p3", doctorId: "d3", date: D(-12), time: "14:00", durationMin: 30, reason: "Rash on forearms", status: "completed", createdAt: 3 },
  { id: "a04", patientId: "p4", doctorId: "d6", date: D(-10), time: "16:00", durationMin: 30, reason: "Diabetes follow-up", status: "completed", createdAt: 4 },
  { id: "a05", patientId: "p6", doctorId: "d1", date: D(-8), time: "11:00", durationMin: 45, reason: "Palpitations assessment", status: "completed", createdAt: 5 },
  { id: "a06", patientId: "p5", doctorId: "d5", date: D(-7), time: "09:00", durationMin: 30, reason: "Recurring migraines", status: "no-show", createdAt: 6 },
  { id: "a07", patientId: "p8", doctorId: "d4", date: D(-7), time: "15:30", durationMin: 45, reason: "Knee pain, left side", status: "completed", createdAt: 7 },
  { id: "a08", patientId: "p9", doctorId: "d6", date: D(-6), time: "10:30", durationMin: 30, reason: "Fatigue and dizziness", status: "completed", createdAt: 8 },
  { id: "a09", patientId: "p10", doctorId: "d2", date: D(-5), time: "13:00", durationMin: 30, reason: "Persistent cough", status: "cancelled", createdAt: 9 },
  { id: "a10", patientId: "p11", doctorId: "d1", date: D(-4), time: "09:00", durationMin: 30, reason: "Chest tightness evaluation", status: "completed", createdAt: 10 },
  { id: "a11", patientId: "p12", doctorId: "d3", date: D(-3), time: "16:30", durationMin: 30, reason: "Acne treatment plan", status: "completed", createdAt: 11 },
  { id: "a12", patientId: "p7", doctorId: "d5", date: D(-2), time: "11:30", durationMin: 30, reason: "Dizziness episodes", status: "completed", createdAt: 12 },
  // ── today (live queues) ──
  { id: "a13", patientId: "p2", doctorId: "d1", date: T, time: "09:00", durationMin: 30, reason: "Hypertension follow-up", status: "confirmed", queueStatus: "completed", createdAt: 13 },
  { id: "a14", patientId: "p6", doctorId: "d1", date: T, time: "09:45", durationMin: 30, reason: "AFib medication review", status: "confirmed", queueStatus: "completed", createdAt: 14 },
  { id: "a15", patientId: "p1", doctorId: "d1", date: T, time: "10:30", durationMin: 30, reason: "Heart murmur re-check", status: "confirmed", queueStatus: "in-progress", createdAt: 15 },
  { id: "a16", patientId: "p11", doctorId: "d1", date: T, time: "11:15", durationMin: 30, reason: "Anemia monitoring", status: "confirmed", queueStatus: "waiting", createdAt: 16 },
  { id: "a17", patientId: "p4", doctorId: "d1", date: T, time: "12:00", durationMin: 30, reason: "Pre-op cardiac clearance", status: "confirmed", queueStatus: "waiting", createdAt: 17 },
  { id: "a18", patientId: "p3", doctorId: "d3", date: T, time: "14:00", durationMin: 30, reason: "Eczema flare-up", status: "confirmed", queueStatus: "waiting", createdAt: 18 },
  { id: "a19", patientId: "p9", doctorId: "d6", date: T, time: "20:00", durationMin: 30, reason: "Thyroid results discussion", status: "confirmed", queueStatus: "waiting", createdAt: 19 },
  // ── upcoming week ──
  { id: "a20", patientId: "p1", doctorId: "d5", date: D(1), time: "10:00", durationMin: 30, reason: "Migraine consultation", status: "confirmed", createdAt: 20 },
  { id: "a21", patientId: "p5", doctorId: "d5", date: D(1), time: "11:00", durationMin: 30, reason: "Neuro follow-up", status: "scheduled", createdAt: 21 },
  { id: "a22", patientId: "p8", doctorId: "d4", date: D(2), time: "09:30", durationMin: 45, reason: "Post-op knee review", status: "confirmed", createdAt: 22 },
  { id: "a23", patientId: "p1", doctorId: "d1", date: D(3), time: "09:30", durationMin: 30, reason: "Echocardiogram results", status: "confirmed", createdAt: 23 },
  { id: "a24", patientId: "p10", doctorId: "d6", date: D(2), time: "17:00", durationMin: 30, reason: "Allergy testing referral", status: "scheduled", createdAt: 24 },
  { id: "a25", patientId: "p12", doctorId: "d3", date: D(4), time: "15:00", durationMin: 30, reason: "Skin sensitivity check", status: "scheduled", createdAt: 25 },
  { id: "a26", patientId: "p2", doctorId: "d1", date: D(5), time: "10:30", durationMin: 30, reason: "Medication titration", status: "confirmed", createdAt: 26 },
  { id: "a27", patientId: "p7", doctorId: "d2", date: D(5), time: "13:30", durationMin: 30, reason: "Sports physical", status: "scheduled", createdAt: 27 },
  { id: "a28", patientId: "p11", doctorId: "d6", date: D(6), time: "18:00", durationMin: 30, reason: "Iron infusion review", status: "scheduled", createdAt: 28 },
];

export const prescriptions: Prescription[] = [
  { id: "rx1", patientId: "p1", doctorId: "d1", date: D(-21), active: true, items: [{ drug: "Salbutamol inhaler", dosage: "100mcg", frequency: "As needed", durationDays: 90, instructions: "Use before exercise" }] },
  { id: "rx2", patientId: "p2", doctorId: "d1", date: D(-14), active: true, items: [{ drug: "Lisinopril", dosage: "10mg", frequency: "Once daily", durationDays: 60 }, { drug: "Amlodipine", dosage: "5mg", frequency: "Once daily", durationDays: 60 }] },
  { id: "rx3", patientId: "p4", doctorId: "d6", date: D(-10), active: true, items: [{ drug: "Metformin", dosage: "850mg", frequency: "Twice daily", durationDays: 90, instructions: "Take with meals" }] },
  { id: "rx4", patientId: "p6", doctorId: "d1", date: D(-8), active: true, items: [{ drug: "Apixaban", dosage: "5mg", frequency: "Twice daily", durationDays: 120 }, { drug: "Atorvastatin", dosage: "20mg", frequency: "At bedtime", durationDays: 120 }] },
  { id: "rx5", patientId: "p9", doctorId: "d6", date: D(-6), active: true, items: [{ drug: "Levothyroxine", dosage: "75mcg", frequency: "Once daily, fasting", durationDays: 90 }] },
  { id: "rx6", patientId: "p11", doctorId: "d1", date: D(-4), active: true, items: [{ drug: "Ferrous sulfate", dosage: "325mg", frequency: "Once daily", durationDays: 60, instructions: "With orange juice" }] },
  { id: "rx7", patientId: "p3", doctorId: "d3", date: D(-12), active: false, items: [{ drug: "Hydrocortisone cream", dosage: "1%", frequency: "Twice daily", durationDays: 14 }] },
];

export const visits: Visit[] = [
  { id: "v1", patientId: "p1", doctorId: "d1", date: D(-21), department: "Cardiology", diagnosis: "Benign heart murmur", notes: "Murmur grade II/VI, no symptoms on exertion. Annual monitoring advised.", vitals: { bp: "118/76", hr: 68, tempC: 36.7, spo2: 99, weightKg: 61 } },
  { id: "v2", patientId: "p2", doctorId: "d1", date: D(-14), department: "Cardiology", diagnosis: "Stage 1 hypertension", notes: "BP improving on current regimen. Continue medication, reduce sodium.", vitals: { bp: "142/90", hr: 74, tempC: 36.8, spo2: 98, weightKg: 84 } },
  { id: "v3", patientId: "p3", doctorId: "d3", date: D(-12), department: "Dermatology", diagnosis: "Contact dermatitis", notes: "Likely nickel exposure. Topical steroid prescribed, patch test offered.", vitals: { bp: "110/70", hr: 72, tempC: 36.6, spo2: 99, weightKg: 55 } },
  { id: "v4", patientId: "p4", doctorId: "d6", date: D(-10), department: "General Medicine", diagnosis: "Type 2 diabetes — stable", notes: "HbA1c 6.8%, down from 7.4%. Continue metformin, diet review booked.", vitals: { bp: "128/82", hr: 78, tempC: 36.9, spo2: 97, weightKg: 92 } },
  { id: "v5", patientId: "p6", doctorId: "d1", date: D(-8), department: "Cardiology", diagnosis: "Atrial fibrillation — rate controlled", notes: "ECG shows rate 78 bpm on apixaban. Holter monitor scheduled.", vitals: { bp: "136/84", hr: 78, tempC: 36.7, spo2: 98, weightKg: 79 } },
  { id: "v6", patientId: "p8", doctorId: "d4", date: D(-7), department: "Orthopedics", diagnosis: "Left knee osteoarthritis", notes: "X-ray: moderate joint space narrowing. Physio referral, corticosteroid injection discussed.", vitals: { bp: "134/86", hr: 70, tempC: 36.8, spo2: 97, weightKg: 88 } },
  { id: "v7", patientId: "p9", doctorId: "d6", date: D(-6), department: "General Medicine", diagnosis: "Hypothyroidism — under-replaced", notes: "TSH 6.2. Increase levothyroxine to 75mcg, recheck in 8 weeks.", vitals: { bp: "116/74", hr: 64, tempC: 36.5, spo2: 99, weightKg: 58 } },
  { id: "v8", patientId: "p11", doctorId: "d1", date: D(-4), department: "Cardiology", diagnosis: "Anemia-related palpitations", notes: "Hemoglobin 9.8 g/dL. Iron studies ordered, ferrous sulfate started.", vitals: { bp: "112/72", hr: 88, tempC: 36.8, spo2: 98, weightKg: 63 } },
];

export const invoices: Invoice[] = [
  { id: "INV-2041", patientId: "p1", appointmentId: "a01", date: D(-21), dueDate: D(9), items: [{ label: "Cardiology consultation", amount: 180 }, { label: "ECG (12-lead)", amount: 95 }], status: "paid", paidAt: D(-18) },
  { id: "INV-2042", patientId: "p2", appointmentId: "a02", date: D(-14), dueDate: D(16), items: [{ label: "Cardiology consultation", amount: 180 }, { label: "Ambulatory BP monitoring", amount: 140 }], status: "pending" },
  { id: "INV-2043", patientId: "p3", appointmentId: "a03", date: D(-12), dueDate: D(18), items: [{ label: "Dermatology consultation", amount: 160 }, { label: "Patch test panel", amount: 210 }], status: "pending" },
  { id: "INV-2044", patientId: "p4", appointmentId: "a04", date: D(-10), dueDate: D(20), items: [{ label: "Internal medicine consultation", amount: 150 }, { label: "HbA1c lab test", amount: 65 }], status: "paid", paidAt: D(-9) },
  { id: "INV-2045", patientId: "p6", appointmentId: "a05", date: D(-8), dueDate: D(22), items: [{ label: "Cardiology consultation", amount: 180 }, { label: "Holter monitor (24h)", amount: 260 }], status: "pending" },
  { id: "INV-2046", patientId: "p5", appointmentId: "a06", date: D(-7), dueDate: D(23), items: [{ label: "Neurology consultation (no-show fee)", amount: 90 }], status: "overdue" },
  { id: "INV-2047", patientId: "p8", appointmentId: "a07", date: D(-7), dueDate: D(23), items: [{ label: "Orthopedic consultation", amount: 190 }, { label: "Knee X-ray (both views)", amount: 150 }], status: "paid", paidAt: D(-5) },
  { id: "INV-2048", patientId: "p9", appointmentId: "a08", date: D(-6), dueDate: D(24), items: [{ label: "Internal medicine consultation", amount: 150 }, { label: "Thyroid function panel", amount: 85 }], status: "pending" },
  { id: "INV-2049", patientId: "p11", appointmentId: "a10", date: D(-4), dueDate: D(26), items: [{ label: "Cardiology consultation", amount: 180 }, { label: "CBC + iron studies", amount: 110 }], status: "overdue" },
  { id: "INV-2050", patientId: "p12", appointmentId: "a11", date: D(-3), dueDate: D(27), items: [{ label: "Dermatology consultation", amount: 160 }], status: "pending" },
  { id: "INV-2051", patientId: "p7", appointmentId: "a12", date: D(-2), dueDate: D(28), items: [{ label: "Neurology consultation", amount: 175 }], status: "pending" },
  { id: "INV-2052", patientId: "p1", appointmentId: "a15", date: T, dueDate: D(30), items: [{ label: "Cardiology consultation", amount: 180 }], status: "pending" },
  { id: "INV-2053", patientId: "p2", appointmentId: "a13", date: T, dueDate: D(30), items: [{ label: "Cardiology consultation", amount: 180 }], status: "pending" },
  { id: "INV-2054", patientId: "p6", appointmentId: "a14", date: T, dueDate: D(30), items: [{ label: "Cardiology consultation", amount: 180 }, { label: "Coagulation panel", amount: 75 }], status: "pending" },
  { id: "INV-2055", patientId: "p4", date: D(-30), dueDate: D(-2), items: [{ label: "Diabetes education session", amount: 120 }, { label: "Diabetic eye screening", amount: 140 }], status: "overdue" },
];

export const labRequests: LabRequest[] = [
  { id: "LAB-301", patientId: "p6", doctorId: "d1", test: "Holter monitor analysis", requestedOn: D(-8), status: "in-progress" },
  { id: "LAB-302", patientId: "p11", doctorId: "d1", test: "CBC + iron studies", requestedOn: D(-4), status: "in-progress" },
  { id: "LAB-303", patientId: "p4", doctorId: "d6", test: "HbA1c", requestedOn: D(-2), status: "resulted", result: "6.8% — improved from 7.4%" },
  { id: "LAB-304", patientId: "p9", doctorId: "d6", test: "TSH + free T4", requestedOn: D(-1), status: "resulted", result: "TSH 6.2 mIU/L — slightly elevated" },
  { id: "LAB-305", patientId: "p2", doctorId: "d1", test: "Lipid panel", requestedOn: T, status: "requested" },
  { id: "LAB-306", patientId: "p1", doctorId: "d1", test: "Echocardiogram", requestedOn: D(-1), status: "requested" },
];

export const wards: Ward[] = [
  {
    id: "w1", name: "General Care", floor: 2,
    rooms: [
      { id: "w1-r1", label: "201", type: "private", beds: [{ id: "w1-r1-b1", label: "201-A", patientId: "p2", since: D(-3) }] },
      { id: "w1-r2", label: "202", type: "semi-private", beds: [{ id: "w1-r2-b1", label: "202-A", patientId: "p8", since: D(-5) }, { id: "w1-r2-b2", label: "202-B" }] },
      { id: "w1-r3", label: "203", type: "semi-private", beds: [{ id: "w1-r3-b1", label: "203-A" }, { id: "w1-r3-b2", label: "203-B" }] },
      { id: "w1-r4", label: "204", type: "private", beds: [{ id: "w1-r4-b1", label: "204-A", patientId: "p6", since: D(-1) }] },
    ],
  },
  {
    id: "w2", name: "Maternity", floor: 3,
    rooms: [
      { id: "w2-r1", label: "301", type: "private", beds: [{ id: "w2-r1-b1", label: "301-A" }] },
      { id: "w2-r2", label: "302", type: "private", beds: [{ id: "w2-r2-b1", label: "302-A", patientId: "p7", since: D(-2) }] },
      { id: "w2-r3", label: "303", type: "semi-private", beds: [{ id: "w2-r3-b1", label: "303-A" }, { id: "w2-r3-b2", label: "303-B" }] },
    ],
  },
  {
    id: "w3", name: "Intensive Care", floor: 4,
    rooms: [
      { id: "w3-r1", label: "ICU-1", type: "icu", beds: [{ id: "w3-r1-b1", label: "ICU-1A", patientId: "p10", since: D(-4) }] },
      { id: "w3-r2", label: "ICU-2", type: "icu", beds: [{ id: "w3-r2-b1", label: "ICU-2A" }] },
      { id: "w3-r3", label: "ICU-3", type: "icu", beds: [{ id: "w3-r3-b1", label: "ICU-3A" }] },
    ],
  },
];

export const staff: StaffMember[] = [
  { id: "s1", name: "Nurse Rosa Delgado", role: "Registered Nurse", department: "Cardiology Ward", shift: "morning", onCall: false, phone: "(555) 020-3301" },
  { id: "s2", name: "Nurse Kenji Watanabe", role: "Registered Nurse", department: "Cardiology Ward", shift: "evening", onCall: true, phone: "(555) 020-3302" },
  { id: "s3", name: "Nurse Fatima Noor", role: "Registered Nurse", department: "Maternity", shift: "morning", onCall: false, phone: "(555) 020-3303" },
  { id: "s4", name: "Nurse Peter Mwangi", role: "ICU Nurse", department: "Intensive Care", shift: "night", onCall: true, phone: "(555) 020-3304" },
  { id: "s5", name: "Nurse Clara Suárez", role: "ICU Nurse", department: "Intensive Care", shift: "morning", onCall: false, phone: "(555) 020-3305" },
  { id: "s6", name: "Tom Iverson", role: "Lab Technician", department: "Pathology Lab", shift: "morning", onCall: false, phone: "(555) 020-3306" },
  { id: "s7", name: "Priya Raman", role: "Lab Technician", department: "Pathology Lab", shift: "evening", onCall: false, phone: "(555) 020-3307" },
  { id: "s8", name: "Dana Whitfield", role: "Front Desk", department: "Reception", shift: "morning", onCall: false, phone: "(555) 020-3308" },
  { id: "s9", name: "Omar Haddad", role: "Pharmacist", department: "Pharmacy", shift: "evening", onCall: false, phone: "(555) 020-3309" },
  { id: "s10", name: "Grace Lin", role: "Radiographer", department: "Imaging", shift: "morning", onCall: true, phone: "(555) 020-3310" },
];

/** revenue for the last 7 days, derived from paid invoices plus a fixed baseline for chart shaping */
export function revenueSeries() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(T, i - 6));
  return days.map((d) => {
    const paid = invoices.filter((inv) => inv.status === "paid" && inv.paidAt === d);
    const total = paid.reduce((s, inv) => s + inv.items.reduce((x, it) => x + it.amount, 0), 0);
    const base = 800 + Math.round((d.charCodeAt(d.length - 1) * 7) % 420);
    return { day: d.slice(5), revenue: total + base };
  });
}
