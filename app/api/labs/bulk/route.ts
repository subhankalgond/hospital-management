import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { labs, patients as patientsT } from "@/db/schema";
import { json, apiError, readJson, requireAccount, ensureRole } from "@/lib/server/api";
import { recordAudit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/labs/bulk — CSV result import.
 *
 * Phase 1 { validate: true }  → parsed report (no writes):
 *   valid rows / invalid rows / unresolved matches / duplicates, all cited.
 * Phase 2 { validate: false } → commits ONLY rows that trained valid in the
 *   same payload; per-row outcomes are audited. Re-uploads are idempotent:
 *   rows whose order already carries a result are reported as duplicates and
 *   never silently overwritten.
 *
 * CSV template (GET ?template=1):
 *   order_ref,lab_test,patient_code,result_text,unit,recorded_at
 */

const HEADER = "order_ref,lab_test,patient_code,result_text,unit,recorded_at";
const MAX_ROWS = 500;
const MAX_BYTES = 512 * 1024;

export async function GET() {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const roleErr = ensureRole(guard.account, ["lab", "admin"]);
  if (roleErr) return roleErr;
  return json({ header: HEADER, template: `${HEADER}\nLB-000001,CBC,PAT-2026-000001,Hemoglobin 11.8 g/dL; WBC 7.2 ×10^9/L,,2026-10-23T10:30:00Z` });
}

interface CsvRow {
  row: number;
  orderRef: string;
  labTest: string;
  patientCode: string;
  resultText: string;
  unit: string;
  recordedAt: string;
}

interface Issue {
  row: number;
  orderRef: string;
  patientCode: string;
  problems: string[];
}

interface Prepared {
  id: string;
  labId: string;
  labTest: string;
  patientId: string;
  patientCode: string;
  resultText: string;
  unit: string;
  recordedAt: string;
  /** duplicate of an already-recorded result — must be excluded, not overwritten */
  duplicateOfExisting: boolean;
}

function parseCsv(text: string): { rows: CsvRow[]; headerProblems: string[] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l.trim() === ""));
  const headerProblems: string[] = [];
  const rows: CsvRow[] = [];
  if (lines.length === 0) return { rows, headerProblems: ["File is empty."] };
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const expected = ["order_ref", "lab_test", "patient_code", "result_text", "unit", "recorded_at"];
  if (header.join(",") !== expected.join(",")) {
    headerProblems.push(`Header must be exactly: ${HEADER}`);
  }
  for (let i = 1; i < lines.length && rows.length <= MAX_ROWS; i++) {
    // naive CSV (values international commas must be quoted or used with ; inside result_text)
    const cols = lines[i].split(",").map((c) => c.trim());
    rows.push({
      row: i + 1,
      orderRef: cols[0] ?? "",
      labTest: cols[1] ?? "",
      patientCode: cols[2] ?? "",
      resultText: cols[3] ?? "",
      unit: cols[4] ?? "",
      recordedAt: cols[5] ?? "",
    });
  }
  return { rows, headerProblems };
}

export async function POST(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) return guard.response;
  const account = guard.account;
  const roleErr = ensureRole(account, ["lab", "admin"]);
  if (roleErr) return roleErr;

  const body = await readJson<{ csv?: string; validate?: boolean; removeDuplicates?: boolean }>(req);
  const csv = (body?.csv ?? "").toString();
  const validate = String(body?.validate ?? true) !== "false";
  const skipDuplicates = body?.removeDuplicates !== false;

  if (!csv.trim()) return apiError("CSV content is required.", 422);
  if (csv.length > MAX_BYTES) return apiError("File exceeds the 512 KB CSV limit.", 413);

  const { rows: csvRows, headerProblems } = parseCsv(csv);
  if (csvRows.length > MAX_ROWS) return apiError(`CSV exceeds the ${MAX_ROWS}-row limit.`, 413);

  const db = await getDb();

  // Resolve match targets once.
  const allLabs = await db.select().from(labs).limit(2000);
  const allPatientCodes = await db
    .select({ id: patientsT.id, patientCode: patientsT.patientCode, name: patientsT.name })
    .from(patientsT)
    .limit(5000);
  const byOrder: Map<string, any> = new Map(allLabs.map((l: any) => [l.id, l] as [string, any]));
  const byCode: Map<string, any> = new Map(allPatientCodes.map((p: any) => [p.patientCode, p] as [string, any]));

  const issues: Issue[] = [];
  const prepared: Prepared[] = [];
  const duplicates: Prepared[] = [];

  for (const r of csvRows) {
    const problems: string[] = [];
    if (!r.orderRef) problems.push("Missing order_ref.");
    if (!r.labTest) problems.push("Missing lab_test.");
    if (!r.patientCode) problems.push("Missing patient_code.");
    if (!r.resultText) problems.push("Missing result_text.");
    if (r.recordedAt && Number.isNaN(Date.parse(r.recordedAt))) problems.push("recorded_at is not a parseable ISO date.");

    let lab: any | undefined;
    if (!problems.length || r.orderRef) {
      lab = byOrder.get(r.orderRef);
      if (!lab && r.orderRef) {
        // Never match on patient name — order IDs are the stable identifier.
        problems.push(`No lab order with ID "${r.orderRef}" in a resolvable state (orders are matched by order_ref only).`);
      }
    }
    if (lab) {
      if (r.labTest && lab.test?.toLowerCase() !== r.labTest.toLowerCase()) {
        problems.push(`lab_test "${r.labTest}" does not match order ${r.orderRef} ("${lab.test}").`);
      }
      if (r.patientCode) {
        const pid = byCode.get(r.patientCode);
        if (!pid) problems.push(`No patient with Patient ID "${r.patientCode}".`);
        else if (lab.patientId !== pid.id) {
          problems.push(`patient_code ${r.patientCode} does not match the patient on order ${r.orderRef}.`);
        }
      }
      if (["cancelled"].includes(lab.workflow ?? "")) problems.push(`Order ${r.orderRef} is cancelled.`);
      // Workflow gate: results only against orders in an expected state.
      if (!["sample_collected", "processing", "result_ready", "verified"].includes(lab.workflow ?? lab.status ?? "ordered")) {
        problems.push(`Order ${r.orderRef} has not reached sample collection.`);
      }
      if (["verified"].includes(lab.workflow ?? "") && lab.result) {
        const p: Prepared = toPrepared(r, lab, byCode.get(r.patientCode)?.id ?? lab.patientId, pidOrCode(r.patientCode, byCode), true);
        duplicates.push(p);
      }
    }
    if (problems.length) {
      issues.push({ row: r.row, orderRef: r.orderRef, patientCode: r.patientCode, problems });
      if (validate) continue;
    }
    if (!problems.length && lab) {
      const pid = byCode.get(r.patientCode)?.id ?? lab.patientId;
      const p = toPrepared(r, lab, pid, r.patientCode, false);
      if (p.duplicateOfExisting) duplicates.push(p);
      if (!p.duplicateOfExisting) prepared.push(p);
    }
  }

  if (validate) {
    return json({
      ok: true,
      mode: "preview",
      headerProblems,
      validCount: prepared.length,
      invalidRows: issues,
      duplicates: duplicates.map((d) => ({ orderRef: d.id, patientCode: d.patientCode, lastAt: d.recordedAt })),
      commitHint: "Re-send with the same CSV body and validate:false to commit the valid rows.",
    });
  }

  // ── Commit phase — only valid rows are written, marked as imported results. ──
  const committed: string[] = [];
  const auditTrail: string[] = [];
  for (const p of prepared) {
    if (!p.id || !p.labId) continue;
    if (skipDuplicates && p.duplicateOfExisting) continue;
    const stamp = `\n[imported ${new Date().toISOString()} by ${account.name}${p.recordedAt ? ` · recorded_at ${p.recordedAt}` : ""}]`;
    await db
      .update(labs)
      .set({
        result: p.resultText + (p.unit ? ` (${p.unit})` : "") + stamp,
        ...(p.duplicateOfExisting ? {} : { workflow: "result_ready" }),
      })
      .where(and(eq(labs.id, p.labId), sql`(workflow <> 'verified' or verified_at is null)`));
    committed.push(p.id);
    auditTrail.push(`import ${p.id} → ${p.patientCode}`);
  }
  await recordAudit(account, {
    action: "create",
    entity: "lab-bulk-import",
    detail: `${committed.length} committed, ${issues.length} invalid, ${duplicates.length} duplicate rows`,
  });

  return json({
    ok: true,
    mode: "commit",
    committed: committed.length,
    orderIds: committed,
    skippedDuplicates: duplicates.length,
    invalidSkipped: issues.length,
    summary: auditTrail.join("; ").slice(0, 400),
  });
}

function pidOrCode(code: string, byCode: Map<string, any>): string {
  return byCode.get(code)?.patientCode ?? code;
}

function toPrepared(r: CsvRow, lab: any, patientId: string, patientCode: string, preFlaggedDuplicate: boolean): Prepared {
  const hasExisting = !!(lab?.result && String(lab.result).length > 0 && ["verified", "result_ready"].includes(lab.workflow ?? lab.status ?? ""));
  return {
    id: lab?.id ?? "",
    labId: lab?.id ?? "",
    labTest: lab?.test ?? r.labTest,
    patientId,
    patientCode,
    resultText: r.resultText,
    unit: r.unit,
    recordedAt: r.recordedAt,
    duplicateOfExisting: preFlaggedDuplicate || hasExisting,
  };
}
