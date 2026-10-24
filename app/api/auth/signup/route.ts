import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, patients, doctors } from "@/db/schema";
import { json, apiError, readJson, newId } from "@/lib/server/api";
import { hashPassword, createSession } from "@/lib/server/auth";
import { validateSignUp } from "@/lib/server/validate";
import { nextPatientCode } from "@/lib/server/patient-id";
import { todayISO } from "@/lib/utils";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`signup:${ip}`, 10, 600_000); // 10 signups per 10 mins per IP
  if (!rl.success) {
    return apiError(`Registration rate limit exceeded. Please try again in ${rl.resetSeconds} seconds.`, 429);
  }

  const body = await readJson<Record<string, unknown>>(req);

  if (!body) return apiError("Invalid request body.");

  const parsed = validateSignUp(body);
  if (!parsed.ok) return apiError(parsed.error, 422);
  const input = parsed.value;

  // Admin signup is gated by a server-side access code.
  if (input.role === "admin") {
    const expected = process.env.ADMIN_ACCESS_CODE?.trim();
    if (!expected) {
      return apiError("Administrator registration is disabled on this server. Contact the system administrator.", 403);
    }
    if (input.accessCode !== expected) {
      return apiError("Invalid administrator access code.", 403);
    }
  }

  const db = await getDb();

  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, input.email))
    .limit(1);
  if (existing.length > 0) {
    return apiError("An account with this email already exists. Try signing in instead.", 409);
  }

  const accountId = newId("u-", 8);
  const passwordHash = hashPassword(input.password);
  const createdAt = todayISO();

  let patientId: string | undefined;
  let doctorId: string | undefined;

  if (input.role === "patient") {
    patientId = newId("P-", 6);
    // Permanent Patient ID — allocated by the shared sequence, never by a client,
    // never reissued per visit. Recorded once and stored on the patient row.
    const patientCode = await nextPatientCode();
    await db.insert(patients).values({
      id: patientId,
      patientCode,
      name: input.name,
      email: input.email,
      phone: input.phone,
      dob: input.dob,
      gender: input.gender,
      bloodGroup: "",
      address: "",
      emergencyContact: { name: "", phone: "", relation: "" },
      allergies: [],
      conditions: [],
      immunizations: [],
      insurance: { provider: "", number: "" },
    });
  } else if (input.role === "doctor") {
    doctorId = newId("D-", 6);
    await db.insert(doctors).values({
      id: doctorId,
      name: input.name,
      qualification: input.qualification,
      licenseNo: input.licenseNo,
      specialty: input.specialty,
      department: input.department,
      email: input.email,
      phone: input.phone,
      room: input.room || "—",
      experienceYears: input.experienceYears,
      rating: 0,
      onCall: false,
      shift: input.shift,
    });
  }

  await db.insert(accounts).values({
    id: accountId,
    role: input.role,
    name: input.name,
    email: input.email,
    passwordHash,
    patientId: patientId ?? null,
    doctorId: doctorId ?? null,
    createdAt,
  });

  await createSession(accountId);

  return json({ ok: true, role: input.role, name: input.name, patientId, patientCode: input.role === "patient" ? (await getAssignedCode(patientId as string)) : undefined, doctorId });
}

/** Fetches the freshly-assigned permanent Patient ID for the response. */
async function getAssignedCode(patientId: string): Promise<string | undefined> {
  const db2 = await getDb();
  const rows = await db2
    .select({ code: patients.patientCode })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  const code = rows[0]?.code;
  return code && code.length > 0 ? code : undefined;
}
