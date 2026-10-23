/**
 * Clinical safety checks for the e-prescription module.
 *
 * Knowledge source: the U.S. FDA `openFDA drug label` API (free, no key, the
 * structured drug-label database maintained by the FDA). Interaction warnings
 * are derived from the official `drug_interactions` section of FDA-approved
 * labeling. This is Decision SUPPORT, not an MTS/licensed CDS: it surfaces
 * potential problems for clinician review — never a verdict that a
 * combination is safe.
 *
 * Expectations:
 * - If openFDA cannot be reached, results are flagged `unavailable` and
 *   serious warnings must be acknowledged explicitly by the clinician.
 * - Allergy and duplicate-therapy checks run locally, deterministically.
 * - Missing data is reported as missing, never as "no risk".
 */
import type { PatientRow, MedicationOrderRow } from "@/db/schema";

export interface InteractionFinding {
  drugA: string;
  drugB: string;
  severity: "major" | "unknown";
  /** verbatim excerpt of FDA labeling, capped for display */
  labelingExcerpt: string;
  labelUrl: string;
}

export interface ChecksResult {
  allergyConflicts: { drug: string; allergy: string }[];
  duplicateTherapy: { drug: string; activeOrder: { id: string; drug: string; frequency: string } }[];
  interactions: InteractionFinding[];
  /** contraindication phrases straight from FDA labeling for the specific drug */
  warningsOnLabel: { drug: string; excerpt: string; labelUrl: string }[];
  knowledgeSource: {
    name: "openFDA drug label";
    url: string;
    queriedAt: string;
  };
  /** true when the external knowledge source could not be queried */
  unavailable: boolean;
  unavailableReason: string;
  /** patient data that was missing for a complete assessment */
  missingData: string[];
  engineVersion: string;
}

export const CHECKS_ENGINE_VERSION = "clinical-checks-1.1.0";

const FDA_URL = "https://api.fda.gov/drug/label.json";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Simple in-process cache (per lambda instance) with TTL. */
const cache = new Map<string, { at: number; data: any }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchDrugLabel(drug: string): Promise<any | null> {
  const key = drug.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const url = `${FDA_URL}?search=openfda.generic_name:"${encodeURIComponent(drug)}"+OR+openfda.brand_name:"${encodeURIComponent(drug)}"&limit=1`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res) return null;
  if (res.status === 404) {
    cache.set(key, { at: Date.now(), data: null });
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const rec = data?.results?.[0] ?? null;
  if (rec) cache.set(key, { at: Date.now(), data: rec });
  return rec;
}

function firstText(v: any): string {
  if (Array.isArray(v)) return (v[0] ?? "").toString();
  if (typeof v === "string") return v;
  return "";
}

function excerptForInteractions(label: any, otherDrug: string): string {
  const section = firstText(label?.drug_interactions);
  if (!section) return "";
  const sentences = section
    .split(/(?<=\.)\s+/)
    .filter((s: string) => s.toLowerCase().includes(otherDrug.toLowerCase()));
  return sentences.slice(0, 2).join(" ").slice(0, 600);
}

function contraindicationExcerpt(label: any): string {
  const contra = firstText(label?.contraindications);
  if (!contra) return "";
  return contra.slice(0, 600);
}

function matchesAllergy(drug: string, allergy: string): boolean {
  const d = drug.toLowerCase().trim();
  const a = allergy.toLowerCase().trim();
  if (!d || !a) return false;
  // Names like "penicillin" match "procaine penicillin", "amoxicillin" …
  return d.includes(a) || a.includes(d);
}

export async function runClinicalChecks(
  items: { drug: string }[],
  patient: PatientRow,
  activeOrders: MedicationOrderRow[]
): Promise<ChecksResult> {
  const result: ChecksResult = {
    allergyConflicts: [],
    duplicateTherapy: [],
    interactions: [],
    warningsOnLabel: [],
    knowledgeSource: { name: "openFDA drug label", url: FDA_URL, queriedAt: new Date().toISOString() },
    unavailable: false,
    unavailableReason: "",
    missingData: [],
    engineVersion: CHECKS_ENGINE_VERSION,
  };

  if (!Array.isArray(patient?.allergies) || patient.allergies.length === 0) {
    result.missingData.push("No recorded allergies — the absence of an allergy record is not proof of absence.");
  }
  if (!patient?.dob) {
    result.missingData.push("Date of birth missing — age-dependent dosing was not checked.");
  }

  // 1. Allergy conflicts (local, deterministic).
  const allergyList = Array.isArray(patient?.allergies) ? ((patient.allergies as unknown) as string[]) : [];
  for (const it of items) {
    for (const allergy of allergyList) {
      if (matchesAllergy(it.drug, allergy)) {
        result.allergyConflicts.push({ drug: it.drug, allergy });
      }
    }
  }

  const drugNames = Array.from(
    new Set(items.map((i) => i.drug).filter(Boolean).map((d) => d.toLowerCase()))
  );

  // 2. Duplicate therapy — same (lowercased stem) drug already in an active order.
  for (const it of items) {
    for (const order of activeOrders) {
      if (!["pending_review", "verified", "dispensing"].includes(order.status)) continue;
      if (matchesAllergy(it.drug, order.drug) && order.drug.toLowerCase() !== it.drug.toLowerCase()) {
        result.duplicateTherapy.push({ drug: it.drug, activeOrder: { id: order.id, drug: order.drug, frequency: order.frequency } });
      }
    }
  }

  // 3. FDA-label interactions — pairwise against each other and the named drug rules.
  let anyQueryFailed = false;
  let queried = 0;
  const labels = new Map<string, any>();
  for (const drug of drugNames) {
    const label = await fetchDrugLabel(drug);
    if (label === undefined) {
      anyQueryFailed = true;
      continue;
    }
    labels.set(drug, label);
    if (label) queried++;
  }

  if (queried === 0 && drugNames.length > 0) {
    result.unavailable = true;
    result.unavailableReason = "The FDA drug-label knowledge source could not be queried from this deployment. No interaction check was performed — do NOT treat the absence of warnings as evidence of safety.";
    return result;
  }

  for (let i = 0; i < drugNames.length; i++) {
    for (let j = i + 1; j < drugNames.length; j++) {
      const a = drugNames[i];
      const b = drugNames[j];
      const labelB = labels.get(b);
      if (!labelB) continue;
      const ev = excerptForInteractions(labelB, a);
      if (ev) {
        result.interactions.push({
          drugA: a,
          drugB: b,
          severity: "unknown", // FDA labeling carries narrative text, not structured severity
          labelingExcerpt: ev,
          labelUrl: `${FDA_URL}?search=openfda.brand_name:"${encodeURIComponent(b)}"&limit=1`,
        });
      }
      const labelA = labels.get(a);
      if (!labelA) continue;
      const evB = excerptForInteractions(labelA, b);
      if (evB) {
        result.interactions.push({
          drugA: b,
          drugB: a,
          severity: "unknown",
          labelingExcerpt: evB,
          labelUrl: `${FDA_URL}?search=openfda.brand_name:"${encodeURIComponent(a)}"&limit=1`,
        });
      }
    }
  }

  // 4. Contraindications from FDA labeling for each drug in the order set.
  for (const drug of drugNames) {
    const label = labels.get(drug);
    if (!label) continue;
    const contra = contraindicationExcerpt(label);
    if (contra) {
      result.warningsOnLabel.push({
        drug,
        excerpt: contra,
        labelUrl: `${FDA_URL}?search=openfda.brand_name:"${encodeURIComponent(drug)}"&limit=1`,
      });
    }
  }

  if (anyQueryFailed) {
    result.missingData.push("One or more FDA-label queries timed out — interaction coverage is partial.");
  }

  return result;
}
