import { NextResponse } from "next/server";
import { eq, and, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { toFhirAppointment, fhirBundle } from "@/lib/fhir";

/** GET /api/fhir/Appointment?patient=…&date=… — FHIR Appointment searchset Bundle. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const patient = url.searchParams.get("patient")?.trim();
  const date = url.searchParams.get("date")?.trim();

  const filters: SQL[] = [];
  // FHIR convention: patient=Patient/<id> or bare id
  const patientId = patient?.replace(/^Patient\//, "");
  if (patientId) filters.push(eq(appointments.patientId, patientId));
  if (date) filters.push(eq(appointments.date, date));

  try {
    const db = await getDb();
    const rows = await (filters.length
      ? db.select().from(appointments).where(and(...filters)).limit(200)
      : db.select().from(appointments).limit(200));
    return NextResponse.json(
      fhirBundle(rows.map(toFhirAppointment), `${url.origin}/api/fhir/Appointment${url.search}`)
    );
  } catch (err) {
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "exception", diagnostics: err instanceof Error ? err.message : "Search failed" }] },
      { status: 500 }
    );
  }
}
