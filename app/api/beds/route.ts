import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { wards } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
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
  } else {
    bed.patientId = undefined;
    bed.since = undefined;
  }

  await db
    .update(wards)
    .set({ rooms })
    .where(eq(wards.id, ward.id));
  return json({ ok: true, action: body.action });
}
