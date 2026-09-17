import { getDb } from "@/db";
import { prescriptions } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { todayISO } from "@/lib/utils";

interface RxItem {
  drug: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role !== "doctor" && account.role !== "admin") {
    return apiError("Only clinicians can issue prescriptions.", 403);
  }

  const body = await readJson<{ patientId?: string; doctorId?: string; items?: RxItem[] }>(req);
  if (!body?.patientId) return apiError("Missing patient.", 422);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return apiError("A prescription needs at least one medication.", 422);
  }

  // Keep only well-formed items.
  const items = body.items
    .filter((it) => it && typeof it.drug === "string" && it.drug.trim())
    .map((it) => ({
      drug: it.drug.trim().slice(0, 120),
      dosage: (it.dosage ?? "").toString().slice(0, 60),
      frequency: (it.frequency ?? "").toString().slice(0, 60),
      durationDays: Number.isFinite(Number(it.durationDays)) ? Number(it.durationDays) : 0,
      instructions: (it.instructions ?? "").toString().slice(0, 300) || undefined,
    }));
  if (items.length === 0) return apiError("A prescription needs at least one medication.", 422);

  const doctorId = account.role === "doctor" ? (account.doctorId ?? "") : (body.doctorId ?? "");
  if (!doctorId) return apiError("Missing doctor.", 422);

  const rx = {
    id: newId("RX-", 6),
    patientId: body.patientId,
    doctorId,
    date: todayISO(),
    items,
    active: true,
  };

  const db = await getDb();
  await db.insert(prescriptions).values(rx);
  return json({ ok: true, id: rx.id });
}
