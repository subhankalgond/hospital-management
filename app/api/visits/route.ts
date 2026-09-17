import { getDb } from "@/db";
import { visits } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { todayISO } from "@/lib/utils";

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "doctor" && account.role !== "admin") {
    return apiError("Only clinicians can record visits.", 403);
  }

  const body = await readJson<{
    patientId?: string;
    doctorId?: string;
    department?: string;
    diagnosis?: string;
    notes?: string;
    vitals?: { bp?: string; hr?: number; tempC?: number; spo2?: number; weightKg?: number };
  }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);

  const doctorId = account.role === "doctor" ? (account.doctorId ?? "") : (body.doctorId ?? "");
  if (!doctorId) return apiError("Missing doctor.", 422);

  const visit = {
    id: newId("V-", 6),
    patientId: body.patientId,
    doctorId,
    date: todayISO(),
    department: (body.department ?? "General Medicine").slice(0, 80),
    diagnosis: (body.diagnosis ?? "").slice(0, 500),
    notes: (body.notes ?? "").slice(0, 2000),
    vitals: {
      bp: body.vitals?.bp ?? "",
      hr: Number(body.vitals?.hr ?? 0),
      tempC: Number(body.vitals?.tempC ?? 0),
      spo2: Number(body.vitals?.spo2 ?? 0),
      weightKg: Number(body.vitals?.weightKg ?? 0),
    },
  };

  const db = await getDb();
  await db.insert(visits).values(visit);
  return json({ ok: true, id: visit.id });
}
