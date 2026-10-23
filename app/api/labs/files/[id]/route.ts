import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labReportFiles, labs } from "@/db/schema";
import { apiError, requireAccount } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/labs/files/[id] — authorized, audited download of a stored PDF.
 * Every access is permission-checked (patients fetch only their own order's
 * files; staff need the lab/admin/doctor role) and logged.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;

  const db = await getDb();
  const file = (await db.select().from(labReportFiles).where(eq(labReportFiles.id, params.id)).limit(1))[0];
  if (!file) return apiError("Report not found.", 404);

  if (account.role === "patient") {
    if (file.patientId !== account.patientId) {
      await recordAudit(account, { action: "view", entity: "lab-report-file", entityId: file.id, detail: "DENIED — foreign patient" });
      return apiError("You can only access your own reports.", 403);
    }
  } else if (!["lab", "admin", "doctor"].includes(account.role)) {
    return apiError("Not allowed.", 403);
  }

  await recordAudit(account, { action: "view", entity: "lab-report-file", entityId: file.id, detail: `downloaded ${file.filename}` });

  const buf = Buffer.from(file.data, "base64");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": file.mime || "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
