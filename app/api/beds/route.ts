import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { wards, admissions } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";
import { todayISO } from "@/lib/utils";

/** POST /api/beds — assign or discharge a bed (admins manage admissions). */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "admin") return apiError("Only admins manage ward beds.", 403);

  const body = await readJson<{
    action?: "assign" | "discharge";
    wardId?: string;
    roomId?: string;
    bedId?: string;
    patientId?: string;
    reason?: string;
  }>(req);
  if (!body?.wardId || !body.roomId || !body.bedId) {
    return apiError("Ward, room and bed are required.", 422);
  }

  const db = await getDb();
  const rows = await db.select().from(wards).where(eq(wards.id, body.wardId)).limit(1);
  const ward = rows[0];
  if (!ward) return apiError("Ward not found.", 404);

  const rooms = (ward.rooms ?? []) as {
    id: string;
    label: string;
    type: string;
    beds: { id: string; label: string; patientId?: string; since?: string }[];
  }[];
  const room = rooms.find((r) => r.id === body.roomId);
  if (!room) return apiError("Room not found.", 404);
  const bed = room.beds.find((b) => b.id === body.bedId);
  if (!bed) return apiError("Bed not found.", 404);

  if (body.action === "assign") {
    if (!body.patientId) return apiError("Patient is required.", 422);
    if (bed.patientId) return apiError("That bed is already occupied.", 409);
    bed.patientId = body.patientId;
    bed.since = todayISO();

    // Permanent admission record — the patient's admission history.
    await db.insert(admissions).values({
      id: newId("AD-", 6),
      patientId: body.patientId,
      wardId: ward.id,
      wardName: ward.name,
      bedId: bed.id,
      bedLabel: bed.label,
      reason: (body.reason ?? "").toString().slice(0, 300),
      notes: "",
      status: "active",
      admittedAt: new Date().toISOString(),
      accountId: guard.account.id,
    });
  } else {
    // Close the active admission for this bed (if any). History is preserved —
    // nothing is deleted; the stay keeps a discharge timestamp.
    const active = await db
      .select()
      .from(admissions)
      .where(and(eq(admissions.bedId, bed.id), eq(admissions.status, "active")))
      .limit(1);
    if (active[0]) {
      await db
        .update(admissions)
        .set({ status: "discharged", dischargedAt: new Date().toISOString() })
        .where(eq(admissions.id, active[0].id));
    }
    await recordAudit(guard.account, { action: "update", entity: "admission", entityId: active[0]?.id ?? "", detail: `discharged bed=${bed.id}` });
    bed.patientId = undefined;
    bed.since = undefined;
  }

  await db
    .update(wards)
    .set({ rooms })
    .where(eq(wards.id, ward.id));
  return json({ ok: true, action: body.action });
}
