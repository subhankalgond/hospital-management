import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, patients, doctors } from "@/db/schema";
import { json, apiError, readJson, newId } from "@/lib/server/api";
import { hashPassword, createSession } from "@/lib/server/auth";
import { validateSignUp } from "@/lib/server/validate";
import { todayISO } from "@/lib/utils";

export async function POST(req: Request) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return apiError("Invalid request body.");

  const parsed = validateSignUp(body);
  if (!parsed.ok) return apiError(parsed.error, 422);
  const input = parsed.value;

  // Admin signup is gated by a server-side access code.
  if (input.role === "admin") {
    const expected = process.env.ADMIN_ACCESS_CODE ?? "CAREPULSE-ADMIN-2026";
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
    await db.insert(patients).values({
      id: patientId,
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

  return json({ ok: true, role: input.role, name: input.name, patientId, doctorId });
}
