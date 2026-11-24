/**
 * CarePulse — Comprehensive Multi-Symptom Diagnostic Intelligence System
 *
 * Integrates the Global Medical Knowledge Base (WHO ICD-11 & MedlinePlus),
 * normalized symptom extraction, emergency triage prioritization,
 * oncology red-flag safety screening, and hospital specialist routing.
 *
 * It provides decision support, never claims a definitive diagnosis,
 * and always emphasizes professional clinician evaluation.
 */
import { routeSymptoms } from "./symptoms";
import { runSymptomIntelligence } from "../medical-kb";

export const ANALYSIS_VERSION = "carepulse-global-icd11-v4";

export interface ExtractedSymptom {
  name: string;
  text: string;
  negated: boolean;
  duration?: string;
  severity?: "mild" | "moderate" | "severe";
}

export interface MatchedCondition {
  id: string;
  name: string;
  icd11Code?: string;
  category?: string;
  department: string;
  specialty?: string;
  urgency: "emergency" | "urgent" | "routine";
  description: string;
  matchScore: number;
  matchedSymptoms: string[];
  otherSymptoms: string[];
  missingClassicSymptoms?: string[];
  cancerWarningSigns?: string[];
  nextSteps: string;
  cancerSafetyDisclaimer?: string;
  requiresBiopsyOrImaging?: boolean;
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  reason: string;
}

export interface MultiSymptomAnalysis {
  symptoms: ExtractedSymptom[];
  negated: string[];
  duration?: string;
  severity?: ExtractedSymptom["severity"];
  urgency: "emergency" | "urgent" | "routine";
  urgencyReason: string;
  suggestedDepartment: string;
  alternativeDepartments: string[];
  possibleConditions: MatchedCondition[];
  cancerWarningsDetected?: { symptomId: string; warningName: string; advice: string }[];
  followUpQuestions: FollowUpQuestion[];
  explanation: string;
  kbMetadata?: {
    totalDiseases: number;
    totalSymptoms: number;
    icd11Standard: string;
    version: string;
  };
  version: string;
}

const FOLLOW_UPS: {
  id: string;
  question: string;
  reason: string;
  when: (s: ExtractedSymptom[], a: { duration?: string; severity?: ExtractedSymptom["severity"] }) => string | null;
}[] = [
  {
    id: "duration",
    question: "How long have you been experiencing these symptoms?",
    reason: "Symptom duration helps determine disease acuity and urgency.",
    when: (_s, a) => (a.duration ? null : "missing"),
  },
  {
    id: "severity",
    question: "How severe is the most troublesome symptom (mild, moderate, or severe)?",
    reason: "Assessing intensity helps guide appropriate triage level.",
    when: (_s, a) => (a.severity ? null : "missing"),
  },
  {
    id: "chest-spread",
    question: "Does any chest discomfort radiate to your neck, jaw, back, or left arm?",
    reason: "Discomfort radiation distinguishes acute coronary events from musculoskeletal pain.",
    when: (s) => (s.some((x) => x.name.toLowerCase().includes("chest") && !x.negated) ? "missing" : null),
  },
  {
    id: "weight-loss",
    question: "Have you experienced any unintentional weight loss or night sweats recently?",
    reason: "Constitutional symptoms help screen for underlying chronic or systemic conditions.",
    when: (_s) => "missing",
  },
];

/**
 * Main multi-symptom analysis orchestrator
 */
export function analyzeSymptoms(input: string, explicitSymptoms?: string[]): MultiSymptomAnalysis {
  const raw = (input || "").trim();

  // Run the clinical intelligence system (WHO ICD-11 & MedlinePlus knowledge base)
  const report = runSymptomIntelligence(raw, explicitSymptoms);

  const symptoms: ExtractedSymptom[] = report.extractedSymptoms.map((e) => ({
    name: e.name,
    text: e.text,
    negated: e.negated,
    duration: e.duration,
    severity: e.severity,
  }));

  const positiveSymptoms = symptoms.filter((s) => !s.negated);
  const positiveNames = positiveSymptoms.map((s) => s.name);

  // Strongest reported duration and severity
  const allDurations = symptoms.map((s) => s.duration).filter(Boolean) as string[];
  const duration = allDurations[allDurations.length - 1];
  const severities = symptoms.map((s) => s.severity).filter(Boolean) as ExtractedSymptom["severity"][];
  const severity = severities.includes("severe") ? "severe" : severities.includes("moderate") ? "moderate" : severities[0];

  // Map matched conditions
  const possibleConditions: MatchedCondition[] = report.possibleConditions.map((res) => ({
    id: res.disease.id,
    name: res.disease.name,
    icd11Code: res.disease.icd11.code,
    category: res.disease.category,
    department: res.disease.department,
    specialty: res.disease.specialty,
    urgency: res.urgency,
    description: res.disease.description,
    matchScore: res.matchScore,
    matchedSymptoms: res.matchedCoreSymptoms.concat(res.matchedAssociatedSymptoms),
    otherSymptoms: res.disease.associatedSymptoms.slice(0, 4),
    missingClassicSymptoms: res.missingClassicSymptoms,
    cancerWarningSigns: res.activeCancerWarnings,
    nextSteps: res.clinicalRecommendation,
    cancerSafetyDisclaimer: res.cancerSafetyDisclaimer,
    requiresBiopsyOrImaging: res.disease.requiresBiopsyOrImaging,
  }));

  // Emergency & Triage determination
  let urgency: MultiSymptomAnalysis["urgency"] = "routine";
  let urgencyReason = "No immediate emergency indicators found.";
  let suggestedDepartment = report.suggestedDepartment;

  if (report.emergencyEvaluation.isEmergency) {
    urgency = "emergency";
    urgencyReason = report.emergencyEvaluation.reasons.join(" ");
    suggestedDepartment = "Emergency Center";
  } else if (report.cancerWarningFlagsDetected.length > 0) {
    urgency = "urgent";
    urgencyReason = `Potential cancer-related warning sign(s) detected: ${report.cancerWarningFlagsDetected.map((w) => w.warningName).join(", ")}. Prompt diagnostic evaluation is advised.`;
  } else if (possibleConditions.length > 0 && possibleConditions[0].urgency === "urgent" && (possibleConditions[0].matchScore >= 50 || positiveSymptoms.length >= 3)) {
    urgency = "urgent";
    urgencyReason = `Symptom pattern correlates with ${possibleConditions[0].name}; clinical evaluation is advised.`;
  }

  // Backup router integration for specialty mapping
  const routing = routeSymptoms(raw || positiveNames.join(", ") || "checkup");
  if (suggestedDepartment === "General Medicine" && routing.confidence > 0.45 && routing.department !== "Emergency Center" && routing.department !== "__EMERGENCY__") {
    if (possibleConditions.length === 0 || possibleConditions[0].matchScore < 40) {
      suggestedDepartment = routing.department;
    }
  }

  // Alternative specialties
  const altSet = new Set<string>(report.alternativeDepartments);
  if (routing.alternatives) {
    for (const a of routing.alternatives) {
      if (a.department !== suggestedDepartment && a.department !== "Emergency Center" && a.department !== "__EMERGENCY__") {
        altSet.add(a.department);
      }
    }
  }
  const alternativeDepartments = Array.from(altSet).slice(0, 3);

  // Pediatric rule
  const CHILD_RE = /\b(child|children|kid|baby|infant|toddler|newborn|son|daughter|year old|years old|month old)\b/i;
  let childNote = false;
  if (urgency === "routine" && CHILD_RE.test(raw)) {
    childNote = true;
    if (suggestedDepartment !== "Pediatrics") {
      const pedIdx = alternativeDepartments.indexOf("Pediatrics");
      if (pedIdx >= 0) alternativeDepartments.splice(pedIdx, 1);
      alternativeDepartments.unshift(suggestedDepartment);
      suggestedDepartment = "Pediatrics";
    }
  }

  // Clinical explanation
  const explanation =
    urgency === "emergency"
      ? `${urgencyReason} Seek emergency medical care immediately — call 112 or proceed to the nearest emergency room.`
      : childNote && suggestedDepartment === "Pediatrics"
        ? `A pediatric patient was described, so ${suggestedDepartment} is recommended.`
        : report.cancerWarningFlagsDetected.length > 0
          ? `Warning sign(s) noted: ${report.cancerWarningFlagsDetected.map((w) => w.warningName).join(", ")}. Recommended specialty: ${suggestedDepartment}. Note that formal clinical exam, imaging, or pathology are needed for accurate assessment.`
          : possibleConditions.length > 0 && possibleConditions[0].matchScore >= 50
            ? `Symptom pattern closely correlates with ${possibleConditions[0].name} (${possibleConditions[0].matchScore}% overlap). Recommended specialty: ${suggestedDepartment}.`
            : `Based on your reported symptoms, ${suggestedDepartment} is recommended for comprehensive clinical evaluation.`;

  // Follow-up questions (emitted only if not emergency)
  const followUpQuestions: FollowUpQuestion[] =
    urgency === "emergency"
      ? []
      : FOLLOW_UPS.map((f) => ({
          id: f.id,
          question: f.question,
          reason: f.reason,
          answer: f.when(symptoms, { duration, severity }) === null ? "present" : "missing",
        }))
          .filter((f) => f.answer === "missing")
          .slice(0, 3)
          .map(({ id, question, reason }) => ({ id, question, reason }));

  return {
    symptoms,
    negated: report.negatedSymptoms,
    duration,
    severity,
    urgency,
    urgencyReason,
    suggestedDepartment,
    alternativeDepartments,
    possibleConditions,
    cancerWarningsDetected: report.cancerWarningFlagsDetected,
    followUpQuestions,
    explanation,
    kbMetadata: {
      totalDiseases: report.kbMetadata.totalDiseases,
      totalSymptoms: report.kbMetadata.totalSymptoms,
      icd11Standard: report.kbMetadata.icd11Standard,
      version: report.kbMetadata.version,
    },
    version: ANALYSIS_VERSION,
  };
}

/** Plain-language medical disclaimer shown with every assessment. */
export const ANALYSIS_DISCLAIMER =
  "This preliminary assessment is AI-assisted clinical decision support grounded in WHO ICD-11 terminology and MedlinePlus references. It is NOT a confirmed medical diagnosis and cannot replace an in-person physical examination, laboratory testing, imaging, or tissue biopsy by a licensed physician.";
