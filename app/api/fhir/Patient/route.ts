import { NextResponse } from "next/server";
import { ilike, or, eq, desc, and, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { toFhirPatient, fhirBundle, fhirOperationOutcome } from "@/lib/fhir";

/**
 * FHIR REST endpoint for Patient resources.
 *
 *   GET  /api/fhir/Patient?name=…&email=…&identifier=…   → searchset Bundle
 *   POST /api/fhir/Patient                               → create from a FHIR Patient
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const email = url.searchParams.get("email")?.trim();
  const identifier = url.searchParams.get("identifier")?.trim();

  const filters: SQL[] = [];
  if (name) filters.push(ilike(patients.name, `%${name}%`));
  if (email) filters.push(ilike(patients.email, `%${email}%`));
  if (identifier) filters.push(eq(patients.id, identifier));

  try {
    const db = await getDb();
    const rows = await (filters.length
      ? db.select().from(patients).where(and(...filters)).orderBy(desc(patients.createdAt)).limit(100)
      : db.select().from(patients).orderBy(desc(patients.createdAt)).limit(100));
    return NextResponse.json(
      fhirBundle(rows.map(toFhirPatient), `${url.origin}/api/fhir/Patient${url.search}`)
    );
  } catch (err) {
    return NextResponse.json(
      fhirOperationOutcome("error", "exception", err instanceof Error ? err.message : "Search failed"),
      { status: 500 }
    );
  }
}

/** Create a CarePulse patient directly from a FHIR Patient resource. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      fhirOperationOutcome("error", "structure", "Request body must be a FHIR Patient JSON object"),
      { status: 400 }
    );
  }

  if (body.resourceType !== "Patient") {
    return NextResponse.json(
      fhirOperationOutcome("error", "structure", "resourceType must be 'Patient'"),
      { status: 400 }
    );
  }

  const names = (body.name ?? []) as { text?: string; family?: string; given?: string[] }[];
  const name = names[0]?.text ?? [names[0]?.given?.join(" "), names[0]?.family].filter(Boolean).join(" ");
  if (!name) {
    return NextResponse.json(
      fhirOperationOutcome("error", "required", "Patient.name is required"),
      { status: 400 }
    );
  }

  const telecom = (body.telecom ?? []) as { system?: string; value?: string }[];
  const email = telecom.find((t) => t.system === "email")?.value ?? `${Date.now().toString(36)}@fhir.import`;
  const phone = telecom.find((t) => t.system === "phone")?.value ?? "";
  const gender = body.gender === "male" || body.gender === "female" ? body.gender : "other";
  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  const address = Array.isArray(body.address)
    ? ((body.address as { text?: string }[])[0]?.text ?? "")
    : "";

  const contacts = (body.contact ?? []) as { name?: { text?: string }; telecom?: { value?: string }[] }[];
  const emergencyContact = {
    name: contacts[0]?.name?.text ?? "",
    phone: contacts[0]?.telecom?.[0]?.value ?? "",
    relation: "",
  };

  const id = `pat-fhir-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    const db = await getDb();
    const [row] = await db
      .insert(patients)
      .values({
        id,
        name: String(name),
        email: String(email),
        phone,
        dob: birthDate,
        gender,
        address,
        emergencyContact,
      })
      .returning();
    return NextResponse.json(toFhirPatient(row), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      fhirOperationOutcome("error", "exception", err instanceof Error ? err.message : "Create failed"),
      { status: 500 }
    );
  }
}
