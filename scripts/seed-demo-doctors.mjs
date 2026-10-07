/**
 * Seeds demo doctors — two per department — with sign-in accounts.
 *
 *   node scripts/seed-demo-doctors.mjs            # upsert + report
 *   node scripts/seed-demo-doctors.mjs --remove   # remove all demo doctors
 *
 * Every demo account:
 *   • uses email domain @demo.carepulse and display name suffix " (Demo)";
 *   • signs in with the shared password Demo@12345 (scrypt-hashed);
 *   • carries a full doctor profile (qualification, license, room, shift…).
 *
 * Idempotent: runs twice = same database. `--remove` deletes demo doctors and
 * their accounts without touching anything else.
 */
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(1);
}

const { default: postgres } = await import("postgres");
const sql = postgres(url, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 20 });

const DEMO_EMAIL_DOMAIN = "@demo.carepulse";
const DEMO_PASSWORD = "Demo@12345";

/** Two demo doctors per department. Positions pair with DOCTOR_TEMPLATES. */
const DEPARTMENT_PLANS = {
  Cardiology: [
    { first: "Anil", last: "Mehta", specialty: "Interventional Cardiologist", room: "C-204" },
    { first: "Sana", last: "Rao", specialty: "Cardiologist", room: "C-205" },
  ],
  Pediatrics: [
    { first: "Meera", last: "Deshpande", specialty: "Pediatrician", room: "P-108" },
    { first: "Rahul", last: "Nair", specialty: "Neonatologist", room: "P-109" },
  ],
  Dermatology: [
    { first: "Kavya", last: "Iyer", specialty: "Dermatologist", room: "D-301" },
    { first: "Vikram", last: "Sethi", specialty: "Cosmetic Dermatologist", room: "D-302" },
  ],
  Orthopedics: [
    { first: "Arjun", last: "Khanna", specialty: "Orthopedic Surgeon", room: "O-402" },
    { first: "Nisha", last: "Pillai", specialty: "Sports Medicine Specialist", room: "O-403" },
  ],
  Neurology: [
    { first: "Farhan", last: "Qureshi", specialty: "Neurologist", room: "N-501" },
    { first: "Divya", last: "Menon", specialty: "Neurologist", room: "N-502" },
  ],
  "General Medicine": [
    { first: "Rakesh", last: "Talwar", specialty: "Internal Medicine", room: "G-101" },
    { first: "Anita", last: "Bose", specialty: "Family Physician", room: "G-102" },
  ],
  Psychiatry: [
    { first: "Nikhil", last: "Chandra", specialty: "Psychiatrist", room: "PS-201" },
    { first: "Tara", last: "Malhotra", specialty: "Psychiatrist", room: "PS-202" },
  ],
  ENT: [
    { first: "Joy", last: "Dutta", specialty: "Otolaryngologist", room: "E-406" },
    { first: "Ritika", last: "Verma", specialty: "Otolaryngologist", room: "E-407" },
  ],
  Ophthalmology: [
    { first: "Sameer", last: "Joshi", specialty: "Ophthalmologist", room: "OP-105" },
    { first: "Pooja", last: "Shah", specialty: "Ophthalmologist", room: "OP-106" },
  ],
  Gynecology: [
    { first: "Lakshmi", last: "Gupta", specialty: "Gynecologist", room: "GY-303" },
    { first: "Imran", last: "Ali", specialty: "Obstetrician", room: "GY-304" },
  ],
};

const EXPERIENCE = [12, 9, 8, 14, 11, 7, 15, 6, 10, 13, 9, 16, 7, 12, 10, 8, 14, 6, 11, 9];
const SHIFTS = ["morning", "evening", "night", "morning", "evening", "morning", "night", "evening", "morning", "evening",
  "night", "morning", "evening", "morning", "night", "evening", "morning", "night", "evening", "morning"];
const PHONES = ["+91 98200 11001", "+91 98200 11002", "+91 98200 11003", "+91 98200 11004", "+91 98200 11005",
  "+91 98200 11006", "+91 98200 11007", "+91 98200 11008", "+91 98200 11009", "+91 98200 11010",
  "+91 98200 11011", "+91 98200 11012", "+91 98200 11013", "+91 98200 11014", "+91 98200 11015",
  "+91 98200 11016", "+91 98200 11017", "+91 98200 11018", "+91 98200 11019", "+91 98200 11020"];

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
}

function hashPassword(password) {
  // mirrors lib/server/auth.ts: hex salt + ":" + hex scryptSync(64)
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function newId(prefix, len) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}${out}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── main ──
if (process.argv.includes("--remove")) {
  const rows = await sql`
    select d.id as doctor_id, a.id as account_id
    from doctors d join accounts a on a.doctor_id = d.id
    where d.email like ${"%" + DEMO_EMAIL_DOMAIN}`;
  await sql`delete from sessions where account_id in (
    select a.id from accounts a join doctors d on a.doctor_id = d.id
    where d.email like ${"%" + DEMO_EMAIL_DOMAIN})`;
  await sql`delete from accounts where doctor_id in (
    select id from doctors where email like ${"%" + DEMO_EMAIL_DOMAIN})`;
  await sql`delete from doctors where email like ${"%" + DEMO_EMAIL_DOMAIN}`;
  console.log(`removed ${rows.length} demo doctors (and their accounts/sessions)`);
  await sql.end();
  process.exit(0);
}

// Email must pass the app's own signup validation rules.
for (const [dept, docs] of Object.entries(DEPARTMENT_PLANS)) {
  for (const doc of docs) {
    const email = `${slug(doc.first + " " + doc.last)}${DEMO_EMAIL_DOMAIN}`;
    const handle = `${slug(doc.first + " " + doc.last)}${"@demo.carepulse"}`;
    if (email !== handle) {
      console.error(`internal: email mismatch for ${doc.first} ${doc.last}`); process.exit(1);
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      console.error(`internal: invalid email ${email}`); process.exit(1);
    }
  }
}

let created = 0, updated = 0;
let i = 0;
for (const [dept, docs] of Object.entries(DEPARTMENT_PLANS)) {
  for (const doc of docs) {
    const name = `${doc.first} ${doc.last} (Demo)`;
    const qualification = doc.specialty.includes("Surgeon") ? "MS, DNB" : "MBBS, MD";
    const licenseNo = `DEMO-${dept.slice(0, 3).toUpperCase()}-${String(1000 + i).padStart(4, "0")}`;
    const email = `${slug(doc.first + " " + doc.last)}${DEMO_EMAIL_DOMAIN}`;
    const experienceYears = EXPERIENCE[i % EXPERIENCE.length];
    const shift = SHIFTS[i % SHIFTS.length];
    const phone = PHONES[i % PHONES.length];
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    // does the demo doctor already exist?
    const existingDoc = await sql`
      select id from doctors where email = ${email} limit 1`;
    let doctorId;
    if (existingDoc.length > 0) {
      doctorId = existingDoc[0].id;
      await sql`
        update doctors set
          name = ${name}, qualification = ${qualification}, license_no = ${licenseNo},
          specialty = ${doc.specialty}, department = ${dept}, phone = ${phone},
          room = ${doc.room}, experience_years = ${experienceYears},
          rating = 4.7, on_call = ${shift === "night"}, shift = ${shift}
        where id = ${doctorId}`;
      updated++;
    } else {
      doctorId = newId("D-", 6);
      await sql`
        insert into doctors (id, name, qualification, license_no, specialty, department,
                            email, phone, room, experience_years, rating, on_call, shift)
        values (${doctorId}, ${name}, ${qualification}, ${licenseNo}, ${doc.specialty}, ${dept},
                ${email}, ${phone}, ${doc.room}, ${experienceYears}, 4.7, ${shift === "night"}, ${shift})`;
      created++;
    }

    // account for sign-in (only rewritten when the password no longer verifies)
    const existingAcc = await sql`
      select id, password_hash, hash_algo from accounts where email = ${email} limit 1`;
    const pwOk =
      existingAcc.length > 0 &&
      existingAcc[0].hash_algo === "scrypt" &&
      verifyPassword(DEMO_PASSWORD, existingAcc[0].password_hash);
    if (existingAcc.length === 0) {
      await sql`
        insert into accounts (id, role, name, email, password_hash, doctor_id, created_at)
        values (${newId("u-", 8)}, 'doctor', ${name}, ${email}, ${hashPassword(DEMO_PASSWORD)}, ${doctorId}, ${now})`;
    } else if (!pwOk) {
      const acc = existingAcc[0];
      await sql`
        update accounts set password_hash = ${hashPassword(DEMO_PASSWORD)}, hash_algo = 'scrypt', salt = null,
                            doctor_id = ${doctorId}, role = 'doctor', name = ${name}
        where id = ${acc.id}`;
    } else {
      await sql`
        update accounts set doctor_id = ${doctorId}, role = 'doctor', name = ${name}
        where id = ${existingAcc[0].id}`;
    }
    i++;
  }
}

console.log(`demo doctors: ${created} created, ${updated} refreshed`);
console.log(`shared password for all: ${DEMO_PASSWORD}`);
console.log("\nDemo sign-ins (2 per department):");
for (const [dept, docs] of Object.entries(DEPARTMENT_PLANS)) {
  for (const doc of docs) {
    console.log(`  ${dept.padEnd(16)} ${doc.first} ${doc.last}  →  ${slug(doc.first + " " + doc.last)}${DEMO_EMAIL_DOMAIN}`);
  }
}
await sql.end();
