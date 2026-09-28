import { getDb } from "@/db";
import { emergencyCases, patients } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import type { EmergencyVitals } from "@/lib/types";

/** POST /api/emergencies — register a new emergency case (admin/doctor). */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Only staff can register emergency cases.", 403);

  const body = await readJson<{
    patientId?: string;
    walkIn?: { name?: string; age?: unknown; gender?: string; contactName?: string; contactPhone?: string };
    symptoms?: string;
    vitals?: Partial<EmergencyVitals>;
    notes?: string;
    trauma?: boolean;
    department?: string;
  }>(req);
  if (!body) return apiError("Invalid request body.");

  const symptoms = typeof body.symptoms === "string" ? body.symptoms.trim() : "";
  if (!symptoms) return apiError("Symptoms are required.", 422);
  if (!body.department) return apiError("Department is required.", 422);

  // Patient: either an existing id or walk-in details (never both, never neither).
  let patientId: string | undefined;
  let walkIn: { name: string; age: number; gender: "male" | "female" | "other"; contactName: string; contactPhone: string } | undefined;

  if (body.patientId) {
    const db = await getDb();
    const rows: { id: string }[] = await db.select({ id: patients.id }).from(patients).limit(1000);
    if (!rows.some((r) => r.id === body.patientId)) {
      return apiError("Patient not found.", 404);
    }
    patientId = body.patientId;
  } else {
    const w = body.walkIn ?? {};
    const name = typeof w.name === "string" ? w.name.trim() : "";
    const age = Number(w.age);
    const gender = typeof w.gender === "string" ? w.gender : "";
    if (!name) return apiError("Walk-in patient name is required.", 422);
    if (!Number.isFinite(age) || age < 0 || age > 130) return apiError("Age must be between 0 and 130.", 422);
    if (!["male", "female", "other"].includes(gender)) return apiError("Please choose a gender.", 422);
    walkIn = { name, age, gender: gender as "male" | "female" | "other", contactName: typeof w.contactName === "string" ? w.contactName.trim() : "", contactPhone: typeof w.contactPhone === "string" ? w.contactPhone.trim() : "" };
  }

  // Vitals: validate every provided numeric field.
  const v = body.vitals ?? {};
  const num = (x: unknown) => Number(x);
  const vitals: EmergencyVitals | null =
    v.hr === undefined && v.bp === undefined
      ? null
      : {
          hr: num(v.hr),
          bp: typeof v.bp === "string" ? v.bp.trim() : "",
          spo2: num(v.spo2),
          rr: num(v.rr),
          tempC: num(v.tempC),
          glucose: num(v.glucose),
          consciousness: (["alert", "verbal", "pain", "unresponsive"].includes(String(v.consciousness))
            ? v.consciousness
            : "alert") as EmergencyVitals["consciousness"],
        };
  if (vitals) {
    if (!Number.isFinite(vitals.hr) || vitals.hr < 0 || vitals.hr > 300) return apiError("Heart rate must be 0–300 BPM.", 422);
    if (!/^\d{2,3}\/\d{2,3}$/.test(vitals.bp)) return apiError("Blood pressure must look like 120/80.", 422);
    if (!Number.isFinite(vitals.spo2) || vitals.spo2 < 50 || vitals.spo2 > 100) return apiError("SpO₂ must be 50–100%.", 422);
    if (!Number.isFinite(vitals.rr) || vitals.rr < 0 || vitals.rr > 80) return apiError("Respiratory rate must be 0–80/min.", 422);
    if (!Number.isFinite(vitals.tempC) || vitals.tempC < 30 || vitals.tempC > 45) return apiError("Temperature must be 30–45 °C.", 422);
    if (!Number.isFinite(vitals.glucose) || vitals.glucose < 0 || vitals.glucose > 1000) return apiError("Glucose must be 0–1000 mg/dL.", 422);
  }

  const now = new Date().toISOString();
  const id = newId("EM-", 6);
  const db = await getDb();

  await db.insert(emergencyCases).values({
    id,
    accountId: guard.account.id,
    patientId: patientId ?? null,
    walkIn: walkIn ?? {},
    symptoms,
    vitals,
    notes: typeof body.notes === "string" ? body.notes.trim() : "",
    trauma: body.trauma === true,
    priority: "MODERATE",
    department: body.department,
    status: "arrived",
    arrivalAt: now,
    updatedAt: now,
  });

  return json({ ok: true, id }, 201);
}

/** GET /api/emergencies — list cases (staff). */
export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Not allowed.", 403);
  const db = await getDb();
  const rows = await db.select().from(emergencyCases);
  return json({ cases: rows });
}
