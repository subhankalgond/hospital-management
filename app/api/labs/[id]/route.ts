import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labs } from "@/db/schema";
import { json, apiError, readJson, requireAccount } from "@/lib/server/api";

const STATUSES = new Set(["requested", "in-progress", "resulted"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  if (guard.account.role === "patient") return apiError("Not allowed.", 403);

  const body = await readJson<{ status?: string; result?: string }>(req);
  const status = body?.status ?? "";
  if (!STATUSES.has(status)) return apiError("Invalid lab status.", 422);

  const db = await getDb();
  const patch: { status: string; result?: string } = { status };
  if (typeof body?.result === "string") patch.result = body.result.slice(0, 4000);

  await db.update(labs).set(patch).where(eq(labs.id, params.id));
  return json({ ok: true });
}
