import { NextResponse } from "next/server";
import { eq, and, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { visits, type VisitRow } from "@/db/schema";
import { toFhirObservations, fhirBundle, fhirOperationOutcome } from "@/lib/fhir";
import { requireAccount } from "@/lib/server/api";

/** GET /api/fhir/Observation?patient=…&code=… — visit vitals as FHIR Observations. */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) {
    return NextResponse.json(
      fhirOperationOutcome("error", "security", "Authentication required to access Observations."),
      { status: 401 }
    );
  }
  const account = guard.account;

  const url = new URL(req.url);
  const patient = url.searchParams.get("patient")?.replace(/^Patient\//, "")?.trim();
  const code = url.searchParams.get("code")?.trim(); // LOINC, e.g. 8867-4

  const filters: SQL[] = [];
  const patientId = patient?.replace(/^Patient\//, "");

  if (account.role === "patient") {
    // Patient can only view their own observations
    filters.push(eq(visits.patientId, account.patientId ?? "__none__"));
  } else if (!["admin", "doctor"].includes(account.role)) {
    return NextResponse.json(
      fhirOperationOutcome("error", "forbidden", "Insufficient permissions to query Observations."),
      { status: 403 }
    );
  } else if (patientId) {
    filters.push(eq(visits.patientId, patientId));
  }

  try {
    const db = await getDb();
    const rows: VisitRow[] = filters.length
      ? await db.select().from(visits).where(and(...filters)).limit(200)
      : await db.select().from(visits).limit(200);
    let observations: Record<string, unknown>[] = rows.flatMap((v: VisitRow) => toFhirObservations(v));
    if (code) {
      observations = observations.filter((o) =>
        JSON.stringify((o as { code?: { coding?: { code?: string }[] } }).code).includes(code)
      );
    }
    return NextResponse.json(
      fhirBundle(observations, `${url.origin}/api/fhir/Observation${url.search}`)
    );
  } catch (err) {
    return NextResponse.json(fhirOperationOutcome("error", "exception", err instanceof Error ? err.message : "Search failed"), { status: 500 });
  }
}
