import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { doctors } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";

/** PATCH /api/doctors/[id] — toggle on-call (staff). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "doctor" && guard.account.doctorId !== params.id) {
    return apiError("You can only toggle your own on-call status.", 403);
  }
  if (!["doctor", "admin"].includes(guard.account.role)) {
    return apiError("Not allowed.", 403);
  }

  const body = await readJson<{ onCall?: boolean }>(req);
  if (typeof body?.onCall !== "boolean") return apiError("onCall must be true or false.", 422);

  const db = await getDb();
  await db.update(doctors).set({ onCall: body.onCall }).where(eq(doctors.id, params.id));
  return json({ ok: true });
}
