/**
 * CarePulse triage engine — DEMO DECISION-SUPPORT.
 *
 * A transparent, rule-based prioritization helper for the Emergency Center.
 * It checks configured vital-sign risk indicators and symptom keywords and
 * proposes a priority. It does NOT diagnose disease, and its output never
 * becomes the final decision: staff must confirm or change the priority,
 * with a reason for any change.
 */
import type {
  ConsciousnessLevel,
  EmergencyPriority,
  EmergencyVitals,
  TriageResult,
} from "@/lib/types";

export const TRIAGE_NOTICE =
  "AI-assisted triage is a decision-support tool and does not replace assessment by qualified medical professionals.";

export const TRIAGE_DEMO_LABEL = "DEMO DECISION-SUPPORT";

/** Ordered highest → lowest so the first hit wins. */
const TIER_ORDER: EmergencyPriority[] = ["CRITICAL", "URGENT", "MODERATE", "LOW"];

/** Symptom keywords mapped to a minimum tier and a human-readable indicator. */
const SYMPTOM_RULES: { tier: EmergencyPriority; keywords: RegExp; indicator: string }[] = [
  { tier: "CRITICAL", keywords: /cardiac arrest|not breathing|unconscious|seizure|convulsion|severe bleeding|stab|gunshot|anaphyla/i, indicator: "Configured emergency indicator detected in symptoms" },
  { tier: "CRITICAL", keywords: /chest pain|crushing pain|radiating/i, indicator: "Cardiac-sounding chest pain reported" },
  { tier: "CRITICAL", keywords: /stroke|face droop|slurred speech|weakness on one side/i, indicator: "Possible stroke indicators in symptoms" },
  { tier: "URGENT", keywords: /shortness of breath|breathless|difficulty breathing|wheez/i, indicator: "Breathing difficulty reported" },
  { tier: "URGENT", keywords: /severe pain|8\/10|9\/10|10\/10/i, indicator: "Severe pain reported" },
  { tier: "MODERATE", keywords: /vomit|fever|dizzy|dizziness|faint|bleeding|fracture|broken/i, indicator: "Moderate-risk symptom reported" },
];

interface RuleHit {
  tier: EmergencyPriority;
  indicator: string;
}

/** Checks one numeric vital against configured risk thresholds. */
function vitalHits(v: EmergencyVitals): RuleHit[] {
  const hits: RuleHit[] = [];

  const systolic = Number.parseInt(v.bp.split("/")[0] ?? "", 10);
  if (Number.isFinite(systolic)) {
    if (systolic < 90) hits.push({ tier: "CRITICAL", indicator: "Systolic blood pressure below 90 mmHg" });
    else if (systolic < 100) hits.push({ tier: "URGENT", indicator: "Low blood pressure (systolic 90–100 mmHg)" });
  }

  if (v.hr > 130 || v.hr < 40) hits.push({ tier: "CRITICAL", indicator: "Heart rate outside safe range (40–130 BPM)" });
  else if (v.hr >= 110) hits.push({ tier: "URGENT", indicator: "Elevated heart rate (110–130 BPM)" });

  if (v.spo2 < 90) hits.push({ tier: "CRITICAL", indicator: "Blood oxygen below 90%" });
  else if (v.spo2 <= 94) hits.push({ tier: "URGENT", indicator: "Blood oxygen 90–94%" });

  if (v.rr > 30 || v.rr < 8) hits.push({ tier: "CRITICAL", indicator: "Respiratory rate outside safe range" });
  else if (v.rr >= 25) hits.push({ tier: "URGENT", indicator: "Respiratory rate 25–30/min" });

  if (v.tempC > 39.5 || v.tempC < 35) hits.push({ tier: "CRITICAL", indicator: "Core temperature in danger zone" });
  else if (v.tempC >= 38.5) hits.push({ tier: "URGENT", indicator: "High fever (38.5–39.5 °C)" });

  if (v.glucose > 400 || (v.glucose > 0 && v.glucose < 60)) hits.push({ tier: "CRITICAL", indicator: "Blood glucose in danger zone" });
  else if (v.glucose > 250) hits.push({ tier: "URGENT", indicator: "Elevated blood glucose (250–400 mg/dL)" });

  if (v.consciousness === "unresponsive") hits.push({ tier: "CRITICAL", indicator: "Patient unresponsive" });
  else if (v.consciousness === "pain") hits.push({ tier: "URGENT", indicator: "Responds only to pain" });

  return hits;
}

function symptomHits(symptoms: string): RuleHit[] {
  const text = symptoms.trim();
  if (!text) return [];
  return SYMPTOM_RULES.filter((r) => r.keywords.test(text)).map((r) => ({ tier: r.tier, indicator: r.indicator }));
}

export interface TriageInput {
  symptoms: string;
  vitals: EmergencyVitals | null;
  age: number;
  trauma: boolean;
}

const RECOMMENDATIONS: Record<EmergencyPriority, string> = {
  CRITICAL: "Immediate clinical assessment recommended.",
  URGENT: "Assessment within 30 minutes recommended.",
  MODERATE: "Assessment within 2 hours recommended.",
  LOW: "Routine assessment is sufficient.",
};

/**
 * Runs the rule-based triage. Returns a TriageResult with demoMode always
 * true — this is a configured-indicator checker, not a medical model.
 */
export function runTriage(input: TriageInput): TriageResult {
  const hits: RuleHit[] = [];

  if (input.vitals) hits.push(...vitalHits(input.vitals));
  hits.push(...symptomHits(input.symptoms));

  if (input.trauma) {
    hits.push({ tier: "CRITICAL", indicator: "Trauma flagged by staff" });
  }

  if (input.age >= 75 && hits.length > 0) {
    hits.push({ tier: "URGENT", indicator: "Advanced age (75+) with additional risk indicators" });
  }

  const priority: EmergencyPriority =
    TIER_ORDER.find((tier) => hits.some((h) => h.tier === tier)) ?? "LOW";

  const riskIndicators = hits
    .filter((h) => h.tier === priority || priority === "LOW")
    .map((h) => h.indicator);

  const reasoning =
    priority === "LOW"
      ? "No configured risk indicators were detected."
      : hits.length === 1
        ? "One configured risk indicator was detected."
        : `${hits.length} configured risk indicators were detected.`;

  return {
    aiPriority: priority,
    riskIndicators: riskIndicators.length > 0 ? riskIndicators : ["No configured indicators"],
    recommendation: RECOMMENDATIONS[priority],
    reasoning,
    demoMode: true,
    ranAt: new Date().toISOString(),
  };
}
