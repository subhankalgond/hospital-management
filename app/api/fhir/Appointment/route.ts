import { NextResponse } from "next/server";
import { eq, and, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { toFhirAppointment, fhirBundle } from "@/lib/fhir";
import { requireAccount } from "@/lib/server/api";

/** GET /api/fhir/Appointment?patient=…&date=… — FHIR Appointment searchset Bundle. */
export async function GET(req: Request) {
  const guard = await requireAccount();
  if ("response" in guard) {
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "security", diagnostics: "Authentication required" }] },
      { status: 401 }
    );
  }
  const account = guard.account;

  const url = new URL(req.url);
  const patient = url.searchParams.get("patient")?.trim();
  const date = url.searchParams.get("date")?.trim();

  const filters: SQL[] = [];
  const patientId = patient?.replace(/^Patient\//, "");

  if (account.role === "patient") {
    filters.push(eq(appointments.patientId, account.patientId ?? "__none__"));
  } else if (!["admin", "doctor"].includes(account.role)) {
    return NextResponse.json(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "forbidden", diagnostics: "Insufficient permissions" }] },
      { status: 403 }
    );
  } else if (patientId) {
    filters.push(eq(appointments.patientId, patientId));
  }
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
