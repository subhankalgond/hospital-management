import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { beds, type BedRow } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";
import { ensureBedsSeeded } from "@/lib/server/beds";
import type { EmergencyPriority } from "@/lib/types";

/**
 * POST /api/beds/recommend — suggest the best available bed for an emergency
 * case: ICU preferred for CRITICAL/URGENT, then any available bed.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Not allowed.", 403);

  const body = await readJson<{ emergencyCaseId?: string; priority?: string }>(req);
  if (!body?.emergencyCaseId) return apiError("emergencyCaseId is required.", 422);

  const db = await getDb();
  await ensureBedsSeeded();

  const rows: BedRow[] = await db.select().from(beds).where(eq(beds.status, "available"));
  if (rows.length === 0) {
    return json({ ok: true, bed: null, message: "No beds are currently available." });
  }

  const priority = (body.priority ?? "MODERATE") as EmergencyPriority;
  const wantsIcu = priority === "CRITICAL" || priority === "URGENT";

  const icu = rows.filter((b) => b.type === "icu");
  const pick =
    (wantsIcu && icu[0]) ||
    rows.find((b) => b.type === "private") ||
    rows.find((b) => b.type === "semi-private") ||
    rows[0];

  return json({ ok: true, bed: pick });
}
