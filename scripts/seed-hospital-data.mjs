/**
 * Seeds "every kind of doctor in the world" — 2 doctors × 24 departments (48
 * clinicians) — plus 1 admin account and 2 patients with demo history.
 *
 *   node scripts/seed-hospital-data.mjs            # first boot / anytime
 *
 * All demo sign-ins share the password Demo@12345. Idempotent (upsert).
 */
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const { default: postgres } = await import("postgres");
const sql = postgres(url, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 20 });

const PASSWORD = "Demo@12345";
const DOMAIN = "@demo.carepulse";

/** 24 departments × 2 doctors. */
const DEPTS = [
  { name: "Cardiology", spec1: "Interventional Cardiologist", spec2: "Cardiac Electrophysiologist" },
  { name: "Pediatrics", spec1: "Pediatrician", spec2: "Neonatologist" },
  { name: "Dermatology", spec1: "Dermatologist", spec2: "Cosmetic Dermatologist" },
  { name: "Orthopedics", spec1: "Orthopedic Surgeon", spec2: "Sports Medicine Specialist" },
  { name: "Neurology", spec1: "Neurologist", spec2: "Neurosurgeon" },
  { name: "General Medicine", spec1: "Internal Medicine", spec2: "Family Physician" },
  { name: "Psychiatry", spec1: "Psychiatrist", spec2: "Child & Adolescent Psychiatrist" },
  { name: "ENT", spec1: "Otolaryngologist", spec2: "Audiologist" },
  { name: "Ophthalmology", spec1: "Ophthalmologist", spec2: "Retina Specialist" },
  { name: "Gynecology", spec1: "Obstetrician", spec2: "Reproductive Endocrinologist" },
  { name: "Urology", spec1: "Urologist", spec2: "Andrologist" },
  { name: "Oncology", spec1: "Medical Oncologist", spec2: "Radiation Oncologist" },
  { name: "Gastroenterology", spec1: "Gastroenterologist", spec2: "Hepatologist" },
  { name: "Pulmonology", spec1: "Pulmonologist", spec2: "Intensivist" },
  { name: "Nephrology", spec1: "Nephrologist", spec2: "Dialysis Specialist" },
  { name: "Endocrinology", spec1: "Endocrinologist", spec2: "Diabetologist" },
  { name: "Anesthesiology", spec1: "Anesthesiologist", spec2: "Pain Management Specialist" },
  { name: "Radiology", spec1: "Diagnostic Radiologist", spec2: "Interventional Radiologist" },
  { name: "Pathology", spec1: "Pathologist", spec2: "Hematopathologist" },
  { name: "Emergency Medicine", spec1: "Emergency Physician", spec2: "Trauma Specialist" },
  { name: "Physical Medicine", spec1: "Physiatrist", spec2: "Rehabilitation Specialist" },
  { name: "Plastic Surgery", spec1: "Plastic Surgeon", spec2: "Craniofacial Surgeon" },
  { name: "Rheumatology", spec1: "Rheumatologist", spec2: "Immunologist" },
  { name: "Geriatrics", spec1: "Geriatrician", spec2: "Palliative Care Specialist" },
];

const NAMES = [
  ["Anil", "Mehta"], ["Sana", "Rao"], ["Meera", "Deshpande"], ["Rahul", "Nair"],
  ["Kavya", "Iyer"], ["Vikram", "Sethi"], ["Arjun", "Khanna"], ["Nisha", "Pillai"],
  ["Farhan", "Qureshi"], ["Divya", "Menon"], ["Rakesh", "Talwar"], ["Anita", "Bose"],
  ["Nikhil", "Chandra"], ["Tara", "Malhotra"], ["Joy", "Dutta"], ["Ritika", "Verma"],
  ["Sameer", "Joshi"], ["Pooja", "Shah"], ["Lakshmi", "Gupta"], ["Imran", "Ali"],
  ["Ravi", "Subramanian"], ["Priya", "Nambiar"], ["Aditya", "Kulkarni"], ["Shruti", "Bhat"],
  ["Karan", "Malhotra"], ["Deepa", "Krishnan"], ["Sanjay", "Purohit"], ["Anjali", "Deshmukh"],
  ["Naveen", "Gounder"], ["Meenakshi", "Rajan"], ["Vivek", "Anand"], ["Swati", "Jain"],
  ["Rohit", "Chowdhury"], ["Ishita", "Roy"], ["Manish", "Tiwari"], ["Preeti", "Sahay"],
  ["Suresh", "Pillai"], ["Bhavana", "Naik"], ["Arvind", "Swaminathan"], ["Nandini", "Iyer"],
  ["Yash", "Bedi"], ["Ritu", "Sood"], ["Prakash", "Naik"], ["Vidya", "Menon"],
  ["Alok", "Trivedi"], ["Sneha", "Kulkarni"], ["Girish", "Paltani"], ["Chhaya", "Trivedi"],
];

const quals = ["MBBS, MD", "MS, DNB", "MBBS, DNB", "MBBS, MS", "MBBS, MD, DM", "MBBS, MD, FRCS"];
const shifts = ["morning", "evening", "night"];

function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, "."); }
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function newId(prefix, len) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}${out}`;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const now = new Date().toISOString().slice(0, 19).replace("T", " ");

// ══ accounts / doctors ══
let created = 0, updated = 0, i = 0;
for (const d of DEPTS) {
  for (let k = 0; k < 2; k++) {
    const [first, last] = NAMES[i] ?? ["", ""];
    if (!first) { console.error(`ran out of names at doctor ${i}`); process.exit(1); }
    const name = `${first} ${last} (Demo)`;
    const email = `${slug(first + " " + last)}${DOMAIN}`;
    if (!EMAIL_RE.test(email)) { console.error(`invalid email ${email}`); process.exit(1); }
    const dept = d.name;
    const specialty = k === 0 ? d.spec1 : d.spec2;
    const qualification = quals[i % quals.length];
    const licenseNo = `DEMO-${dept.slice(0, 3).toUpperCase()}-${String(1000 + i).padStart(4, "0")}`;
    const experienceYears = 6 + (i % 11);
    const shift = shifts[i % 3];
    const room = `${dept.slice(0, 2).toUpperCase()}-${100 + i}`;
    const phone = `+91 982${String(1000000 + i).slice(0, 5)} ${String(11000 + i).slice(0, 5)}`;

    const existingDoc = await sql`select id from doctors where email = ${email} limit 1`;
    let doctorId;
    if (existingDoc.length > 0) {
      doctorId = existingDoc[0].id;
      await sql`update doctors set name=${name}, qualification=${qualification},
        license_no=${licenseNo}, specialty=${specialty}, department=${dept},
        phone=${phone}, room=${room}, experience_years=${experienceYears},
        rating=4.7, on_call=${shift === "night"}, shift=${shift} where id=${doctorId}`;
      updated++;
    } else {
      doctorId = newId("D-", 6);
      await sql`insert into doctors (id, name, qualification, license_no, specialty, department,
        email, phone, room, experience_years, rating, on_call, shift)
        values (${doctorId}, ${name}, ${qualification}, ${licenseNo}, ${specialty}, ${dept},
        ${email}, ${phone}, ${room}, ${experienceYears}, 4.7, ${shift === "night"}, ${shift})`;
      created++;
    }

    const acc = await sql`select id, password_hash, hash_algo from accounts where email=${email} limit 1`;
    if (acc.length === 0) {
      await sql`insert into accounts (id, role, name, email, password_hash, doctor_id, created_at)
        values (${newId("u-", 8)}, 'doctor', ${name}, ${email}, ${hashPassword(PASSWORD)}, ${doctorId}, ${now})`;
    } else {
      await sql`update accounts set password_hash=${hashPassword(PASSWORD)}, hash_algo='scrypt',
        salt=null, doctor_id=${doctorId}, role='doctor', name=${name} where id=${acc[0].id}`;
    }
    i++;
  }
}

// ══ admin ══
const ADMIN_EMAIL = "admin@carepulse.health";
const ADMIN_PASSWORD = "Admin@12345";
const adminAcc = await sql`select id from accounts where email=${ADMIN_EMAIL} limit 1`;
if (adminAcc.length === 0) {
  await sql`insert into accounts (id, role, name, email, password_hash, created_at)
    values (${newId("u-", 8)}, 'admin', 'Hospital Administrator', ${ADMIN_EMAIL}, ${hashPassword(ADMIN_PASSWORD)}, ${now})`;
  console.log(`admin created: ${ADMIN_EMAIL}`);
} else {
  console.log(`admin exists: ${ADMIN_EMAIL}`);
}

// ══ patients ══
const PATIENTS = [
  {
    name: "Rohit Sharma", email: "rohit@demo.carepulse", phone: "+91 91234 56780",
    dob: "1988-04-12", gender: "male", bloodGroup: "B+",
    address: "12 Juhu Tara Road, Mumbai 400049",
    emergencyContact: { name: "Priya Sharma", phone: "+91 91234 56781", relation: "Spouse" },
    allergies: ["Penicillin"], conditions: ["Hypertension"], immunizations: ["Influenza (2025)", "Tdap (2020)"],
    insurance: { provider: "Star Health", number: "SH-8842-1160-33" },
  },
  {
    name: "Meera Iyer", email: "meera@demo.carepulse", phone: "+91 91234 56782",
    dob: "1996-09-30", gender: "female", bloodGroup: "O+",
    address: "45 Anna Salai, Chennai 600002",
    emergencyContact: { name: "Ramesh Iyer", phone: "+91 91234 56783", relation: "Father" },
    allergies: ["Dust mites"], conditions: ["Asthma"], immunizations: ["Hepatitis B (2010)"],
    insurance: { provider: "HDFC Ergo", number: "HE-2210-5590-11" },
  },
];

const PATIENT_PASSWORD = "Patient@12345";
for (const p of PATIENTS) {
  const pAcc = await sql`select id from accounts where email=${p.email} limit 1`;
  if (pAcc.length > 0) { console.log(`patient exists: ${p.email}`); continue; }

  const patientId = newId("P-", 6);
  await sql`insert into patients (id, name, email, phone, dob, gender, blood_group, address,
    emergency_contact, allergies, conditions, immunizations, insurance, created_at)
    values (${patientId}, ${p.name}, ${p.email}, ${p.phone}, ${p.dob}, ${p.gender}, ${p.bloodGroup}, ${p.address},
    ${JSON.stringify(p.emergencyContact)}::jsonb, ${JSON.stringify(p.allergies)}::jsonb,
    ${JSON.stringify(p.conditions)}::jsonb, ${JSON.stringify(p.immunizations)}::jsonb,
    ${JSON.stringify(p.insurance)}::jsonb, now())`;

  await sql`insert into accounts (id, role, name, email, password_hash, patient_id, created_at)
    values (${newId("u-", 8)}, 'patient', ${p.name}, ${p.email}, ${hashPassword(PATIENT_PASSWORD)}, ${patientId}, ${now})`;

  // demo visits / appointments / invoices / prescription
  const general = await sql`select id, name from doctors where department='General Medicine' order by id limit 1`;
  const cardiologist = await sql`select id, name from doctors where department='Cardiology' order by id limit 1`;
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const apptId = newId("A-", 6);
  await sql`insert into appointments (id, patient_id, doctor_id, date, time, duration_min, reason, status, queue_status, notes, created_at)
    values (${apptId}, ${patientId}, ${cardiologist[0]?.id ?? general[0].id}, ${future}, '10:30', 30,
    ${p.name === "Rohit Sharma" ? "Follow-up: blood pressure management" : "Wheezing episodes review"},
    'confirmed', null, '', ${String(Date.now())})`;

  const visitDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const visitId = newId("V-", 6);
  await sql`insert into visits (id, patient_id, doctor_id, date, department, diagnosis, notes, vitals)
    values (${visitId}, ${patientId}, ${general[0].id}, ${visitDate}, 'General Medicine',
    ${p.name === "Rohit Sharma" ? "Stage-1 hypertension, controlled" : "Mild asthma, seasonal exacerbation"},
    ${p.name === "Rohit Sharma" ? "Discussed salt restriction and started home BP diary." : "Advised trigger avoidance; rescue inhaler as needed."},
    ${JSON.stringify({ bp: "128/84", hr: 78, tempC: 36.8, spo2: 98, weightKg: 72 })}::jsonb)`;

  await sql`insert into prescriptions (id, patient_id, doctor_id, date, items, active)
    values (${newId("RX-", 6)}, ${patientId}, ${general[0].id}, ${visitDate},
    ${JSON.stringify(p.name === "Rohit Sharma"
      ? [{ drug: "Amlodipine", dosage: "5 mg", frequency: "Once daily", durationDays: 30, instructions: "After breakfast" }]
      : [{ drug: "Salbutamol inhaler", dosage: "2 puffs", frequency: "As needed", durationDays: 30, instructions: "Rinse mouth after use" }])}::jsonb, true)`;

  const invId = newId("INV-", 6);
  await sql`insert into invoices (id, patient_id, appointment_id, date, due_date, items, status, paid_at)
    values (${invId}, ${patientId}, null, ${visitDate}, ${new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)},
    ${JSON.stringify([{ label: "General Medicine consultation", amount: 150 }, { label: "ECG", amount: 120 }])}::jsonb,
    'paid', now())`;

  console.log(`patient created: ${p.email} (1 visit, 1 prescription, 1 paid invoice, 1 upcoming appt)`);
}

const counts = await sql`select (select count(*) from doctors) doctors, (select count(*) from accounts) accounts, (select count(*) from patients) patients, (select count(*) from appointments) appts, (select count(*) from visits) visits, (select count(*) from invoices) inv, (select count(*) from prescriptions) rx`;
console.log("Final counts:", JSON.stringify(counts[0]));
console.log(`\nSign-ins (password for all doctors: ${PASSWORD}; admin: ${ADMIN_PASSWORD}; patients: ${PATIENT_PASSWORD})`);
console.log(`  admin:      ${ADMIN_EMAIL}`);
console.log(`  patients:   rohit@demo.carepulse / meera@demo.carepulse`);
console.log(`  doctors:    first.last@demo.carepulse (48 across ${DEPTS.length} departments)`);
await sql.end();
