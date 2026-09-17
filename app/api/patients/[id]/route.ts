import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";

/**
 * PATCH /api/patients/[id] — profile edit.
 * Patients may edit only themselves; staff may edit anyone.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role === "patient" && account.patientId !== params.id) {
    return apiError("You can only edit your own profile.", 403);
  }

  const body = await readJson<{
    phone?: string;
    address?: string;
    bloodGroup?: string;
    emergencyContact?: { name?: string; phone?: string; relation?: string };
    allergies?: string[];
    conditions?: string[];
    insurance?: { provider?: string; number?: string };
  }>(req);
  if (!body) return apiError("Invalid request body.", 422);

  const patch: Partial<typeof patients.$inferInsert> = {};
  if (typeof body.phone === "string") patch.phone = body.phone.trim().slice(0, 40);
  if (typeof body.address === "string") patch.address = body.address.trim().slice(0, 400);
  if (typeof body.bloodGroup === "string") patch.bloodGroup = body.bloodGroup.trim().slice(0, 4);

  if (body.emergencyContact && typeof body.emergencyContact === "object") {
    patch.emergencyContact = {
      name: (body.emergencyContact.name ?? "").toString().trim().slice(0, 120),
      phone: (body.emergencyContact.phone ?? "").toString().trim().slice(0, 40),
      relation: (body.emergencyContact.relation ?? "").toString().trim().slice(0, 60),
    };
  }
  if (Array.isArray(body.allergies)) {
    patch.allergies = body.allergies.map((a) => String(a).trim().slice(0, 120)).filter(Boolean);
  }
  if (Array.isArray(body.conditions)) {
    patch.conditions = body.conditions.map((c) => String(c).trim().slice(0, 120)).filter(Boolean);
  }
  if (body.insurance && typeof body.insurance === "object") {
    patch.insurance = {
      provider: (body.insurance.provider ?? "").toString().trim().slice(0, 120),
      number: (body.insurance.number ?? "").toString().trim().slice(0, 60),
    };
  }

  if (Object.keys(patch).length === 0) return apiError("Nothing to update.", 422);

  const db = await getDb();
  await db.update(patients).set(patch).where(eq(patients.id, params.id));
  return json({ ok: true });
}
