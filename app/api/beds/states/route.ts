import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { beds, bedAudit } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { ensureBedsSeeded } from "@/lib/server/beds";
import { todayISO } from "@/lib/utils";
import type { BedStatus } from "@/lib/types";

/**
 * Allowed bed state transitions. Beds move forward through the turnaround
 * lifecycle; maintenance can be entered from any state and restored from
 * maintenance only.
 */
const TRANSITIONS: Record<string, { from: BedStatus[]; needsReason?: boolean; needsPatient?: boolean }> = {
  reserve: { from: ["available"], needsPatient: false },
  occupy: { from: ["reserved", "available"] },
  discharge: { from: ["occupied"] },
  "start-cleaning": { from: ["discharge-pending", "occupied"] },
  inspect: { from: ["cleaning"] },
  release: { from: ["inspection"] },
  maintenance: { from: ["available", "reserved", "occupied", "discharge-pending", "cleaning", "inspection"], needsReason: true },
  restore: { from: ["maintenance"], needsReason: true },
  "release-reservation": { from: ["reserved"] },
};

/** GET /api/beds/states — full bed inventory + recent audit (admin). */
export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "admin") return apiError("Only admins manage beds.", 403);

  await ensureBedsSeeded();
  const db = await getDb();
  const [bedRows, auditRows] = await Promise.all([
    db.select().from(beds).orderBy(beds.wardId, beds.label),
    db.select().from(bedAudit).orderBy(desc(bedAudit.at)).limit(200),
  ]);
  return json({ beds: bedRows, audit: auditRows });
}

/**
 * POST /api/beds/states — perform a validated state transition.
 * Every accepted transition writes a bed_audit row.
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role !== "admin") return apiError("Only admins manage beds.", 403);

  const body = await readJson<{
    action?: keyof typeof TRANSITIONS;
    bedId?: string;
    patientId?: string;
    emergencyCaseId?: string;
    reason?: string;
  }>(req);
  if (!body?.action || !body.bedId) return apiError("Action and bed are required.", 422);
  const rule = TRANSITIONS[body.action];
  if (!rule) return apiError("Unknown action.", 422);

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (rule.needsReason && !reason) return apiError("A reason is required for this action.", 422);

  const db = await getDb();
  const rows = await db.select().from(beds).where(eq(beds.id, body.bedId)).limit(1);
  const bed = rows[0];
  if (!bed) return apiError("Bed not found.", 404);

  const current = bed.status as BedStatus;
  if (!rule.from.includes(current)) {
    return apiError(`Cannot ${body.action.replace(/-/g, " ")} a bed that is ${current}.`, 409);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { lastStatusChange: now };
  let to: BedStatus = current;

  switch (body.action) {
    case "reserve": {
      if (!body.emergencyCaseId) return apiError("An emergency case is required to reserve a bed.", 422);
      patch.status = "reserved";
      patch.reservedFor = body.emergencyCaseId;
      patch.reservedAt = now;
      to = "reserved";
      break;
    }
    case "occupy": {
      if (current === "available" && !body.patientId) return apiError("A patient is required to occupy a bed.", 422);
      patch.status = "occupied";
      if (body.patientId) patch.patientId = body.patientId;
      patch.occupiedSince = todayISO();
      patch.reservedFor = null;
      patch.reservedAt = null;
      to = "occupied";
      break;
    }
    case "discharge": {
      patch.status = "discharge-pending";
      to = "discharge-pending";
      break;
    }
    case "start-cleaning": {
      patch.status = "cleaning";
      patch.patientId = null;
      patch.occupiedSince = null;
      to = "cleaning";
      break;
    }
    case "inspect": {
      patch.status = "inspection";
      to = "inspection";
      break;
    }
    case "release": {
      patch.status = "available";
      to = "available";
      break;
    }
    case "maintenance": {
      patch.status = "maintenance";
      if (current === "occupied") {
        patch.patientId = null;
        patch.occupiedSince = null;
      }
      patch.reservedFor = null;
      patch.reservedAt = null;
      to = "maintenance";
      break;
    }
    case "restore": {
      patch.status = "available";
      to = "available";
      break;
    }
    case "release-reservation": {
      patch.status = "available";
      patch.reservedFor = null;
      patch.reservedAt = null;
      to = "available";
      break;
    }
  }

  await db.update(beds).set(patch).where(eq(beds.id, bed.id));

  await db.insert(bedAudit).values({
    id: newId("BA-", 8),
    bedId: bed.id,
    bedLabel: bed.label,
    fromStatus: current,
    toStatus: to,
    changedBy: guard.account.id,
    changedByName: guard.account.name,
    reason: reason || null,
    at: now,
  });

  return json({ ok: true, status: to });
}
