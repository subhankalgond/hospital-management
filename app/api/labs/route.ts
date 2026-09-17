import { getDb } from "@/db";
import { labs } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount } from "@/lib/server/api";
import { todayISO } from "@/lib/utils";

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  if (account.role === "patient") return apiError("Patients cannot request lab tests directly.", 403);

  const body = await readJson<{ patientId?: string; doctorId?: string; test?: string }>(req);
  if (!body?.patientId || !body.test?.trim()) {
    return apiError("Patient and test name are required.", 422);
  }

  const doctorId = account.role === "doctor" ? (account.doctorId ?? "") : (body.doctorId ?? "");
  if (!doctorId) return apiError("Missing doctor.", 422);

  const lab = {
    id: newId("LAB-", 4),
    patientId: body.patientId,
    doctorId,
    test: body.test.trim().slice(0, 160),
    requestedOn: todayISO(),
    status: "requested",
  };

  const db = await getDb();
  await db.insert(labs).values(lab);
  return json({ ok: true, id: lab.id });
}
