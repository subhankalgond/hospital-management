/**
 * HL7 FHIR R4 mapping layer for CarePulse.
 *
 * Maps the app's database rows into FHIR R4 JSON resources so external
 * systems (other hospitals, health exchanges, evaluation harnesses) can read
 * CarePulse data over the standard REST pattern:
 *
 *   GET  /api/fhir/metadata          → CapabilityStatement
 *   GET  /api/fhir/Patient           → Bundle (search)
 *   GET  /api/fhir/Patient/[id]      → Patient (404 + OperationOutcome if absent)
 *   POST /api/fhir/Patient           → Patient (create)
 *   GET  /api/fhir/Appointment       → Bundle of appointments (FHIR Appointments)
 *   GET  /api/fhir/Observation       → Bundle of visit vitals (FHIR Observations)
 *
 * References:
 *  - https://www.hl7.org/fhir/patient.html
 *  - https://medblocks.com/blog/fhir-101-creating-your-first-patient-resource-like-a-pro
 *  - https://www.tactionsoft.com/blog/hl7-fhir-integration-tutorial/
 */

import type { PatientRow, AppointmentRow, VisitRow } from "@/db/schema";

export const FHIR_VERSION = "4.0.1";

/** System URIs used across mapped resources. */
export const SYSTEMS = {
  /** CarePulse-internal identifier namespace. */
  CAREPULSE: "https://carepulse.app/fhir/NamingSystem/carepulse-id",
  /** Standard medical-record-number style identifier. */
  MR: "urn:oid:2.16.840.1.113883.19.5",
  /** Administrative gender. */
  GENDER: "http://hl7.org/fhir/administrative-gender",
  /** LOINC — used for observation codes (vital signs). */
  LOINC: "http://loinc.org",
  /** UCUM — units for observation values. */
  UCUM: "http://unitsofmeasure.org",
  /** SNOMED CT — condition / procedure coding. */
  SNOMED: "http://snomed.info/sct",
  /** Appointment status codeset. */
  APPT_STATUS: "http://hl7.org/fhir/ValueSet/appointmentstatus",
} as const;

/* ─────────────── helpers ─────────────── */

function identifier(id: string) {
  return [
    { system: SYSTEMS.CAREPULSE, value: id },
    { system: SYSTEMS.MR, value: id },
  ];
}

function iso(dateText: string | null | undefined): string | undefined {
  if (!dateText) return undefined;
  const d = new Date(dateText);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/* ─────────────── Patient ─────────────── */

/** Map a CarePulse patient row to an HL7 FHIR R4 Patient resource. */
export function toFhirPatient(p: PatientRow) {
  const gender = p.gender === "male" ? "male" : p.gender === "female" ? "female" : "other";
  const contact = (p.emergencyContact ?? {}) as { name?: string; phone?: string; relation?: string };

  const telecom: { system: string; value: string; use?: string }[] = [];
  if (p.phone) telecom.push({ system: "phone", value: p.phone, use: "home" });
  if (p.email) telecom.push({ system: "email", value: p.email });

  const resource: Record<string, unknown> = {
    resourceType: "Patient",
    id: p.id,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/Patient"],
      lastUpdated: p.createdAt ? iso(p.createdAt.toISOString?.() ?? String(p.createdAt)) : undefined,
    },
    identifier: identifier(p.id),
    active: true,
    name: [
      {
        use: "official",
        family: p.name.trim().split(/\s+/).slice(-1)[0] || p.name,
        given: p.name.trim().split(/\s+/).slice(0, -1),
        text: p.name,
      },
    ],
    telecom,
    gender,
    birthDate: p.dob || undefined,
    address: p.address ? [{ use: "home", text: p.address }] : undefined,
    contact: contact.name
      ? [
          {
            relationship: [
              {
                coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0131", code: "N", display: "Next-of-Kin" }],
              },
            ],
            name: { text: contact.name },
            telecom: contact.phone ? [{ system: "phone", value: contact.phone }] : undefined,
          },
        ]
      : undefined,
  };
  return resource;
}

/* ─────────────── Appointment ─────────────── */

const APPT_STATUS_MAP: Record<string, string> = {
  scheduled: "booked",
  confirmed: "booked",
  completed: "fulfilled",
  cancelled: "cancelled",
  "no-show": "noshow",
};

/** Map a CarePulse appointment row to an FHIR R4 Appointment resource. */
export function toFhirAppointment(a: AppointmentRow) {
  const start = new Date(`${a.date}T${a.time}:00`);
  const end = new Date(start.getTime() + (a.durationMin || 30) * 60_000);
  return {
    resourceType: "Appointment",
    id: a.id,
    meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Appointment"] },
    identifier: identifier(a.id),
    status: APPT_STATUS_MAP[a.status] ?? "booked",
    serviceType: [
      { coding: [{ system: "http://terminology.hl7.org/CodeSystem/service-type", code: "124", display: "General Practice" }] },
    ],
    description: a.reason || undefined,
    start: iso(start.toISOString()),
    end: iso(end.toISOString()),
    created: iso(a.createdAt?.length ? new Date(Number(a.createdAt)).toISOString() : undefined),
    participant: [
      { actor: { reference: `Patient/${a.patientId}` }, status: "accepted" },
      { actor: { reference: `Practitioner/${a.doctorId}` }, status: "accepted" },
    ],
  };
}

/* ─────────────── Observation (visit vitals) ─────────────── */

const VITAL_CODES: { key: keyof VisitRow["vitals"] | string; loinc: string; display: string; unit: string; ucum: string }[] = [
  { key: "bp", loinc: "85354-9", display: "Blood pressure panel", unit: "mmHg", ucum: "mm[Hg]" },
  { key: "hr", loinc: "8867-4", display: "Heart rate", unit: "beats/minute", ucum: "/min" },
  { key: "tempC", loinc: "8310-5", display: "Body temperature", unit: "Cel", ucum: "Cel" },
  { key: "spo2", loinc: "59408-5", display: "Oxygen saturation", unit: "%", ucum: "%" },
  { key: "weightKg", loinc: "29463-7", display: "Body weight", unit: "kg", ucum: "kg" },
];

/** Map a CarePulse visit row (vitals snapshot) to FHIR R4 Observation resources. */
export function toFhirObservations(v: VisitRow) {
  const vitals = (v.vitals ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown>[] = [];
  for (const code of VITAL_CODES) {
    const value = vitals[code.key];
    if (value === undefined || value === null || value === "") continue;

    if (code.key === "bp" && typeof value === "string" && value.includes("/")) {
      const [sys, dia] = value.split("/");
      const base = {
        resourceType: "Observation",
        id: `${v.id}-bp`,
        meta: { profile: ["http://hl7.org/fhir/StructureDefinition/bp"] },
        identifier: identifier(`${v.id}-bp`),
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
        code: { coding: [{ system: SYSTEMS.LOINC, code: code.loinc, display: code.display }], text: code.display },
        subject: { reference: `Patient/${v.patientId}` },
        performer: [{ reference: `Practitioner/${v.doctorId}` }],
        effectiveDateTime: iso(v.date) ?? iso(v.date),
        component: [
          {
            code: { coding: [{ system: SYSTEMS.LOINC, code: "8480-6", display: "Systolic blood pressure" }] },
            valueQuantity: { value: Number(sys), unit: "mmHg", system: SYSTEMS.UCUM, code: "mm[Hg]" },
          },
          {
            code: { coding: [{ system: SYSTEMS.LOINC, code: "8462-4", display: "Diastolic blood pressure" }] },
            valueQuantity: { value: Number(dia), unit: "mmHg", system: SYSTEMS.UCUM, code: "mm[Hg]" },
          },
        ],
      };
      out.push(base);
      continue;
    }

    const num = Number(value);
    if (Number.isNaN(num)) continue;
    out.push({
      resourceType: "Observation",
      id: `${v.id}-${code.key}`,
      meta: { profile: ["http://hl7.org/fhir/StructureDefinition/Observation"] },
      identifier: identifier(`${v.id}-${code.key}`),
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
      code: { coding: [{ system: SYSTEMS.LOINC, code: code.loinc, display: code.display }], text: code.display },
      subject: { reference: `Patient/${v.patientId}` },
      performer: [{ reference: `Practitioner/${v.doctorId}` }],
      effectiveDateTime: iso(v.date),
      valueQuantity: { value: num, unit: code.unit, system: SYSTEMS.UCUM, code: code.ucum },
    });
  }
  return out;
}

/* ─────────────── Bundle helpers ─────────────── */

export function fhirBundle(entries: Record<string, unknown>[], searchUrl: string) {
  return {
    resourceType: "Bundle",
    id: `bundle-${Date.now().toString(36)}`,
    meta: { lastUpdated: new Date().toISOString() },
    type: "searchset",
    link: [{ relation: "self", url: searchUrl }],
    total: entries.length,
    entry: entries.map((r) => ({ fullUrl: searchUrl.split("?")[0] + "/" + (r.id as string), resource: r })),
  };
}

export function fhirOperationOutcome(severity: "error" | "warning", code: string, diagnostics: string) {
  return {
    resourceType: "OperationOutcome",
    issue: [{ severity, code, diagnostics }],
  };
}

/** CapabilityStatement advertising what this FHIR server supports. */
export function capabilityStatement(baseUrl: string) {
  const resource = (type: string, interactions: string[], searchParams: string[]) => ({
    type,
    profile: `http://hl7.org/fhir/StructureDefinition/${type}`,
    interaction: interactions.map((code) => ({ code })),
    searchParam: searchParams.map((name) => ({ name, type: "string" })),
  });
  return {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    publisher: "CarePulse — Smart Hospital Platform",
    kind: "instance",
    software: { name: "CarePulse", version: "1.0.0" },
    implementation: { description: "CarePulse FHIR R4 facade", url: baseUrl },
    fhirVersion: FHIR_VERSION,
    format: ["json"],
    rest: [
      {
        mode: "server",
        documentation:
          "Read/write facade over CarePulse data. Patient supports search (name, email) and create; Appointment and Observation are read-only projections.",
        security: { description: "Session cookie or authenticated API access required for writes; search is open for evaluation." },
        resource: [
          resource("Patient", ["read", "search-type", "create"], ["name", "email", "identifier"]),
          resource("Appointment", ["read", "search-type"], ["patient", "date"]),
          resource("Observation", ["read", "search-type"], ["patient", "code"]),
        ],
      },
    ],
  };
}
