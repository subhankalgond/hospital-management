import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { toFhirPatient, fhirOperationOutcome } from "@/lib/fhir";

/** GET /api/fhir/Patient/[id] — read one FHIR Patient (OperationOutcome on 404). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const [row] = await db.select().from(patients).where(eq(patients.id, params.id)).limit(1);
    if (!row) {
      return NextResponse.json(
        fhirOperationOutcome("error", "not-found", `Patient ${params.id} was not found`),
        { status: 404 }
      );
    }
    return NextResponse.json(toFhirPatient(row));
  } catch (err) {
    return NextResponse.json(
      fhirOperationOutcome("error", "exception", err instanceof Error ? err.message : "Read failed"),
      { status: 500 }
    );
  }
}
