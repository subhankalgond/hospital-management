import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { toFhirPatient, fhirOperationOutcome } from "@/lib/fhir";
import { requireAccount } from "@/lib/server/api";

/** GET /api/fhir/Patient/[id] — read one FHIR Patient (OperationOutcome on 404). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAccount();
  if ("response" in guard) {
    return NextResponse.json(
      fhirOperationOutcome("error", "security", "Authentication required to access Patient record."),
      { status: 401 }
    );
  }
  const account = guard.account;
  if (account.role === "patient" && account.patientId !== params.id) {
    return NextResponse.json(
      fhirOperationOutcome("error", "forbidden", "You can only view your own patient record."),
      { status: 403 }
    );
  }

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
