import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leaves } from "@/db/schema";
import { json, apiError, requireAccount } from "@/lib/server/api";

/** DELETE /api/leaves/[id] — a doctor cancels their own upcoming leave. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;

  const db = await getDb();
  const rows = await db.select().from(leaves).where(eq(leaves.id, params.id)).limit(1);
  const leave = rows[0];
  if (!leave) return apiError("Leave not found.", 404);

  if (guard.account.role === "doctor") {
    if (guard.account.doctorId !== leave.doctorId) {
      return apiError("You can only cancel your own leave.", 403);
    }
  } else if (guard.account.role !== "admin") {
    return apiError("Not allowed.", 403);
  }

  await db.delete(leaves).where(and(eq(leaves.id, leave.id)));
  return json({ ok: true });
}
