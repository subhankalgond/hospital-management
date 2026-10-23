import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { labs, labReportFiles } from "@/db/schema";
import { json, apiError, readJson, newId, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

const MAX_BASE64_LEN = 7 * 1024 * 1024; // ~5 MB binary
const ALLOWED_MIME = new Set(["application/pdf"]);

/**
 * POST /api/labs/files — upload a lab report PDF for one lab order.
 * Body: { labId, filename, dataBase64, mime? }
 *
 * Files are stored as private BLOB rows — there is no public URL and no
 * global signed link. Every download is an authorized, audited request
 * (GET /api/labs/files/[id]).
 */
export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["lab", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ labId?: string; filename?: string; dataBase64?: string; mime?: string }>(req);
  if (!body?.labId || !body?.filename || !body?.dataBase64) {
    return apiError("labId, filename and dataBase64 are required.", 422);
  }
  const mime = (body.mime ?? "application/pdf").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return apiError("Only PDF reports are accepted.", 415);
  if (body.dataBase64.length > MAX_BASE64_LEN) return apiError("File exceeds the 5 MB limit.", 413);
  if (body.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/=\s]+$/.test(body.dataBase64)) {
    return apiError("Malformed file content (not valid base64).", 422);
  }

  const db = await getDb();
  const lab = (await db.select().from(labs).where(eq(labs.id, body.labId)).limit(1))[0];
  if (!lab) return apiError("Lab order not found.", 404);

  // .pdf magic check on the decoded header
  let head = "";
  try {
    head = Buffer.from(body.dataBase64.slice(0, 8), "base64").toString("latin1");
  } catch {
    /* fallthrough */
  }
  if (!head.startsWith("%PDF")) return apiError("Content is not a valid PDF document.", 422);

  const size = Buffer.byteLength(body.dataBase64, "base64");
  const rows = await db
    .insert(labReportFiles)
    .values({
      id: newId("LF-", 6),
      labId: lab.id,
      patientId: lab.patientId,
      visitId: lab.visitId ?? null,
      filename: body.filename.slice(0, 200),
      mime,
      size,
      data: body.dataBase64,
      uploadedBy: account.id,
      uploadedByName: account.name,
      reviewStatus: "pending_review",
    })
    .returning();
  const out: any[] = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  await recordAudit(account, { action: "create", entity: "lab-report-file", entityId: out[0]?.id, detail: `${body.filename} for ${lab.id}` });
  return json({ ok: true, file: { ...out[0], data: undefined } }, 201);
}

/** GET /api/labs/files?labId=… — metadata only (no content). */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const url = new URL(req.url);
  const labId = url.searchParams.get("labId") ?? "";

  const db = await getDb();
  if (account.role === "patient") {
    // Patients may list only their own reports' metadata.
    if (!account.patientId) return json({ files: [] });
    const rows = await db
      .select({
        id: labReportFiles.id,
        labId: labReportFiles.labId,
        filename: labReportFiles.filename,
        mime: labReportFiles.mime,
        size: labReportFiles.size,
        uploadedAt: labReportFiles.uploadedAt,
        reviewStatus: labReportFiles.reviewStatus,
      })
      .from(labReportFiles)
      .where(eq(labReportFiles.patientId, account.patientId))
      .orderBy(desc(labReportFiles.uploadedAt))
      .limit(100);
    return json({ files: rows });
  }

  if (!["lab", "admin", "doctor"].includes(account.role)) return apiError("Not allowed.", 403);
  const rows = await db
    .select({
      id: labReportFiles.id,
      labId: labReportFiles.labId,
      patientId: labReportFiles.patientId,
      visitId: labReportFiles.visitId,
      filename: labReportFiles.filename,
      mime: labReportFiles.mime,
      size: labReportFiles.size,
      uploadedByName: labReportFiles.uploadedByName,
      uploadedAt: labReportFiles.uploadedAt,
      reviewStatus: labReportFiles.reviewStatus,
      reviewedByName: labReportFiles.reviewedByName,
      reviewedAt: labReportFiles.reviewedAt,
    })
    .from(labReportFiles)
    .where(labId ? eq(labReportFiles.labId, labId) : and())
    .orderBy(desc(labReportFiles.uploadedAt))
    .limit(100);
  return json({ files: rows });
}

/**
 * PATCH /api/labs/files — review step: an authorized user verifies the PDF
 * and (optionally) copies the HUMAN-REVIEWED result text onto the order.
 * Extracted text is never saved automatically — this endpoint requires the
 * reviewer's explicit `resultText` to become the order result.
 */
export async function PATCH(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["lab", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ fileId?: string; action?: "review"; resultText?: string; verifiedReport?: boolean }>(req);
  if (!body?.fileId || body?.action !== "review") return apiError("fileId and action=review are required.", 422);

  const db = await getDb();
  const file = (await db.select().from(labReportFiles).where(eq(labReportFiles.id, body.fileId)).limit(1))[0];
  if (!file) return apiError("Report not found.", 404);

  await db
    .update(labReportFiles)
    .set({
      reviewStatus: "reviewed",
      reviewedBy: account.id,
      reviewedByName: account.name,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(labReportFiles.id, file.id));

  let orderUpdated = false;
  if (body.verifiedReport && (body.resultText ?? "").trim()) {
    const alreadyVerified = (await db.select().from(labs).where(and(eq(labs.id, file.labId), eq(labs.workflow, "verified"))).limit(1))[0];
    if (alreadyVerified) {
      return apiError("This order already holds a verified result — existing verified results are never silently overwritten.", 409);
    }
    await db
      .update(labs)
      .set({
        result: (body.resultText as string).slice(0, 4000) + `\n[verified from uploaded report ${file.id} by ${account.name} ${new Date().toISOString()}]`,
        workflow: "result_ready",
      })
      .where(eq(labs.id, file.labId));
    orderUpdated = true;
  }

  await recordAudit(account, { action: "update", entity: "lab-report-file", entityId: file.id, detail: orderUpdated ? "reviewed + order result copied after human verification" : "reviewed" });
  return json({ ok: true, orderUpdated });
}
