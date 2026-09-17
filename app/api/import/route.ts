import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  patients as patientsT,
  doctors as doctorsT,
  appointments as appointmentsT,
  prescriptions as prescriptionsT,
  visits as visitsT,
  invoices as invoicesT,
  labs as labsT,
  wards as wardsT,
} from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";

/**
 * One-time migration: an admin can upload the device's legacy localStorage
 * snapshot (real accounts created before the server existed). Rows with ids
 * that already exist are skipped, so this is safe to retry.
 *
 * Legacy accounts keep their SHA-256 password parameters (salt + hashAlgo)
 * and are transparently upgraded to scrypt on the user's next sign-in.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "admin") {
    return apiError("Only an administrator can import legacy data.", 403);
  }

  const body = await readJson<{
    accounts?: unknown[];
    patients?: unknown[];
    doctors?: unknown[];
    appointments?: unknown[];
    prescriptions?: unknown[];
    visits?: unknown[];
    invoices?: unknown[];
    labs?: unknown[];
    wards?: unknown[];
  }>(req);
  if (!body) return apiError("Invalid request body.");

  const db = await getDb();

  const asRecord = (v: unknown): Record<string, unknown> =>
    (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const s = (o: Record<string, unknown>, k: string, fallback = "") =>
    typeof o[k] === "string" ? (o[k] as string) : fallback;
  const n = (o: Record<string, unknown>, k: string, fallback = 0) => {
    const v = Number(o[k]);
    return Number.isFinite(v) ? v : fallback;
  };

  const result = { accounts: 0, patients: 0, doctors: 0, appointments: 0, prescriptions: 0, visits: 0, invoices: 0, labs: 0, wards: 0 };

  // Patients & doctors first (other rows reference them).
  for (const raw of body.patients ?? []) {
    const p = asRecord(raw);
    const id = s(p, "id");
    if (!id) continue;
    const exists = await db.select({ id: patientsT.id }).from(patientsT).where(eq(patientsT.id, id)).limit(1);
    if (exists.length > 0) continue;
    await db.insert(patientsT).values({
      id,
      name: s(p, "name", "Unnamed"),
      email: s(p, "email"),
      phone: s(p, "phone"),
      dob: s(p, "dob"),
      gender: ["male", "female", "other"].includes(s(p, "gender")) ? s(p, "gender") : "other",
      bloodGroup: s(p, "bloodGroup"),
      address: s(p, "address"),
      emergencyContact: (p.emergencyContact ?? { name: "", phone: "", relation: "" }) as object,
      allergies: (Array.isArray(p.allergies) ? p.allergies : []) as string[],
      conditions: (Array.isArray(p.conditions) ? p.conditions : []) as string[],
      immunizations: (Array.isArray(p.immunizations) ? p.immunizations : []) as object[],
      insurance: (p.insurance ?? { provider: "", number: "" }) as object,
    });
    result.patients++;
  }

  for (const raw of body.doctors ?? []) {
    const d = asRecord(raw);
    const id = s(d, "id");
    if (!id) continue;
    const exists = await db.select({ id: doctorsT.id }).from(doctorsT).where(eq(doctorsT.id, id)).limit(1);
    if (exists.length > 0) continue;
    await db.insert(doctorsT).values({
      id,
      name: s(d, "name", "Unnamed"),
      qualification: s(d, "qualification"),
      licenseNo: s(d, "licenseNo"),
      specialty: s(d, "specialty", "General"),
      department: s(d, "department", "General Medicine"),
      email: s(d, "email"),
      phone: s(d, "phone"),
      room: s(d, "room", "—"),
      experienceYears: n(d, "experienceYears"),
      rating: n(d, "rating"),
      onCall: Boolean(d.onCall),
      shift: ["morning", "evening", "night"].includes(s(d, "shift")) ? s(d, "shift") : "morning",
    });
    result.doctors++;
  }

  for (const raw of body.accounts ?? []) {
    const a = asRecord(raw);
    const id = s(a, "id");
    const email = s(a, "email").toLowerCase();
    if (!id || !email) continue;
    const exists = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).limit(1);
    const existsEmail = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (exists.length > 0 || existsEmail.length > 0) continue;
    await db.insert(accounts).values({
      id,
      role: ["patient", "doctor", "admin"].includes(s(a, "role")) ? s(a, "role") : "patient",
      name: s(a, "name", "Unnamed"),
      email,
      passwordHash: s(a, "passwordHash"),
      salt: s(a, "salt") || null,
      hashAlgo: s(a, "hashAlgo", "sha256") === "scrypt" ? "scrypt" : "sha256",
      patientId: s(a, "patientId") || null,
      doctorId: s(a, "doctorId") || null,
      createdAt: s(a, "createdAt", new Date().toISOString().slice(0, 10)),
    });
    result.accounts++;
  }

  const clinical = [
    { key: "appointments" as const, table: appointmentsT },
    { key: "prescriptions" as const, table: prescriptionsT },
    { key: "visits" as const, table: visitsT },
    { key: "invoices" as const, table: invoicesT },
    { key: "labs" as const, table: labsT },
  ];

  for (const { key, table } of clinical) {
    for (const raw of (body[key] ?? []) as unknown[]) {
      const o = asRecord(raw);
      const id = s(o, "id");
      if (!id) continue;
      const exists = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      if (exists.length > 0) continue;

      if (table === appointmentsT) {
        await db.insert(appointmentsT).values({
          id,
          patientId: s(o, "patientId"),
          doctorId: s(o, "doctorId"),
          date: s(o, "date"),
          time: s(o, "time"),
          durationMin: n(o, "durationMin", 30),
          reason: s(o, "reason"),
          status: s(o, "status", "confirmed"),
          queueStatus: s(o, "queueStatus") || null,
          notes: s(o, "notes") || null,
          createdAt: String(n(o, "createdAt", Date.now())),
        });
      } else if (table === prescriptionsT) {
        await db.insert(prescriptionsT).values({
          id,
          patientId: s(o, "patientId"),
          doctorId: s(o, "doctorId"),
          date: s(o, "date"),
          items: (Array.isArray(o.items) ? o.items : []) as object[],
          active: Boolean(o.active),
        });
      } else if (table === visitsT) {
        await db.insert(visitsT).values({
          id,
          patientId: s(o, "patientId"),
          doctorId: s(o, "doctorId"),
          date: s(o, "date"),
          department: s(o, "department", "General Medicine"),
          diagnosis: s(o, "diagnosis"),
          notes: s(o, "notes"),
          vitals: (o.vitals ?? {}) as object,
        });
      } else if (table === invoicesT) {
        await db.insert(invoicesT).values({
          id,
          patientId: s(o, "patientId"),
          appointmentId: s(o, "appointmentId") || null,
          date: s(o, "date"),
          dueDate: s(o, "dueDate"),
          items: (Array.isArray(o.items) ? o.items : []) as object[],
          status: s(o, "status", "pending"),
          paidAt: s(o, "paidAt") || null,
        });
      } else if (table === labsT) {
        await db.insert(labsT).values({
          id,
          patientId: s(o, "patientId"),
          doctorId: s(o, "doctorId"),
          test: s(o, "test"),
          requestedOn: s(o, "requestedOn"),
          status: s(o, "status", "requested"),
          result: s(o, "result") || null,
        });
      }
      result[key]++;
    }
  }

  // Merge ward bed occupancy (structure is canonical from the server).
  for (const raw of body.wards ?? []) {
    const w = asRecord(raw);
    const id = s(w, "id");
    if (!id) continue;
    const exists = await db.select({ id: wardsT.id }).from(wardsT).where(eq(wardsT.id, id)).limit(1);
    if (exists.length > 0) {
      // Take the bed occupancy from the device snapshot.
      const rooms = (w.rooms ?? []) as object[];
      await db.update(wardsT).set({ rooms }).where(eq(wardsT.id, id));
      result.wards++;
    } else {
      await db.insert(wardsT).values({
        id,
        name: s(w, "name", "Ward"),
        floor: n(w, "floor"),
        rooms: (w.rooms ?? []) as object[],
      });
      result.wards++;
    }
  }

  return json({ ok: true, imported: result });
}
