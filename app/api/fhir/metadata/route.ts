import { NextResponse } from "next/server";
import { capabilityStatement } from "@/lib/fhir";

/** GET /api/fhir/metadata — FHIR CapabilityStatement for the CarePulse facade. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json(capabilityStatement(`${url.origin}/api/fhir`));
}
