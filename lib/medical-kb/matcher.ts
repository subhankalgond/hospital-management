/**
 * CarePulse — Clinical Intelligence & Differential Matching Engine
 * 
 * Provides evidence-based symptom extraction, emergency triage prioritization,
 * cancer warning sign detection, and multi-symptom differential condition ranking.
 */
import { GLOBAL_SYMPTOMS } from "./symptoms";
import { GLOBAL_DISEASES } from "./diseases";
import { KB_METADATA, MEDICAL_SOURCES } from "./sources";
import {
  SymptomDefinition,
  DiseaseDefinition,
  MatchedDiseaseResult,
  EmergencyEvaluation,
  MultiSymptomDiagnosisReport,
} from "./types";

const NEGATION_CUES = /\b(no|not|without|denies?|never|n't|don'?t have|do not have|does not have|no signs? of|free of|absent)\b/i;
const CLAUSE_SPLIT = /[,;.!\n]|\band\b|\balong with\b|\bwith\b|\bbut\b|\balso\b|\bas well as\b|\bplus\b|-{2,}/i;
const DURATION_RE = /\b(since|for|from)\s+(this\s+)?(morning|evening|afternoon|night|yesterday|today|a few hours|few hours|two days|three days|four days|five days|\d+\s*(day|days|week|weeks|month|months|hour|hours)\b[^,;.]*?)/i;
const SEVERITY_WORDS: [RegExp, "mild" | "moderate" | "severe"][] = [
  [/unbearable|excruciating|worst|severe|intense|10\/10|9\/10|8\/10/, "severe"],
  [/moderate|bothersome|7\/10|6\/10|5\/10|quite/, "moderate"],
  [/mild|slight|a little|manageable|2\/10|1\/10|3\/10|4\/10/, "mild"],
];

/** Emergency combination rules evaluated before any routine condition ranking */
interface EmergencyRule {
  symptomIds: string[];
  minHits: number;
  reason: string;
}

const EMERGENCY_RULES: EmergencyRule[] = [
  {
    symptomIds: ["chest-pain", "chest-pain-radiating"],
    minHits: 1,
    reason: "Acute retrosternal chest discomfort radiating to arm/jaw is a high-risk sign of acute myocardial infarction.",
  },
  {
    symptomIds: ["chest-pain", "shortness-of-breath"],
    minHits: 2,
    reason: "Chest discomfort with dyspnea suggests acute cardiopulmonary compromise (acute coronary syndrome or pulmonary embolism).",
  },
  {
    symptomIds: ["face-drooping"],
    minHits: 1,
    reason: "Acute facial drooping is a critical stroke warning sign requiring immediate emergency intervention.",
  },
  {
    symptomIds: ["slurred-speech"],
    minHits: 1,
    reason: "Sudden slurring of speech or dysarthria is a primary neurological stroke indicator.",
  },
  {
    symptomIds: ["one-sided-weakness"],
    minHits: 1,
    reason: "Sudden weakness or numbness on one side of the body represents an acute stroke emergency.",
  },
  {
    symptomIds: ["loss-of-consciousness"],
    minHits: 1,
    reason: "Loss of consciousness / syncope requires immediate emergency stabilization and cardiac/neurological assessment.",
  },
  {
    symptomIds: ["seizure"],
    minHits: 1,
    reason: "Active or recurrent seizures require emergent evaluation to ensure airway protection and terminate seizure activity.",
  },
  {
    symptomIds: ["shortness-of-breath"],
    minHits: 1,
    reason: "Acute breathing difficulty or respiratory distress requires urgent emergency triage to maintain airway and oxygenation.",
  },
  {
    symptomIds: ["rlq-abdominal-pain"],
    minHits: 1,
    reason: "Localized right lower quadrant abdominal pain strongly suggests acute appendicitis requiring urgent surgical evaluation.",
  },
  {
    symptomIds: ["coughing-blood"],
    minHits: 1,
    reason: "Hemoptysis (coughing up blood) warrants immediate clinical investigation to rule out pulmonary embolism or active hemorrhage.",
  },
];

/**
 * Normalizes free text input and structured chip arrays into recognized symptoms.
 */
export function extractSymptoms(
  transcript: string,
  explicitChips?: string[]
): {
  extracted: {
    id: string;
    name: string;
    text: string;
    negated: boolean;
    duration?: string;
    severity?: "mild" | "moderate" | "severe";
  }[];
  negated: string[];
} {
  const extracted: {
    id: string;
    name: string;
    text: string;
    negated: boolean;
    duration?: string;
    severity?: "mild" | "moderate" | "severe";
  }[] = [];
  const negated: string[] = [];

  const raw = (transcript || "").trim();
  const sentences = raw.split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
  const clauses: string[] = [];
  for (const sentence of sentences) {
    for (const part of sentence.split(CLAUSE_SPLIT)) {
      const t = part.trim().toLowerCase();
      if (t && t.length >= 2) clauses.push(t);
    }
  }

  // 1. Scan free text clauses
  for (const clause of clauses) {
    for (const sym of GLOBAL_SYMPTOMS) {
      if (sym.regexPattern.test(clause)) {
        const isNeg = NEGATION_CUES.test(clause);
        const durationMatch = clause.match(DURATION_RE);
        const severityMatch = SEVERITY_WORDS.find(([re]) => re.test(clause));

        if (isNeg) {
          if (!negated.includes(sym.id)) negated.push(sym.id);
        } else {
          if (!extracted.some((e) => e.id === sym.id)) {
            extracted.push({
              id: sym.id,
              name: sym.patientFriendlyName,
              text: clause,
              negated: false,
              duration: durationMatch ? durationMatch[0].trim() : undefined,
              severity: severityMatch ? severityMatch[1] : undefined,
            });
          }
        }
        break;
      }
    }
  }

  // 2. Also register any explicit symptom chips passed from the UI
  if (Array.isArray(explicitChips)) {
    for (const chip of explicitChips) {
      const trimmed = chip.trim().toLowerCase();
      for (const sym of GLOBAL_SYMPTOMS) {
        const matchesName =
          sym.patientFriendlyName.toLowerCase().includes(trimmed) ||
          trimmed.includes(sym.patientFriendlyName.toLowerCase()) ||
          sym.standardMedicalName.toLowerCase().includes(trimmed) ||
          sym.synonyms.some((syn) => syn.toLowerCase() === trimmed || trimmed.includes(syn.toLowerCase()));

        if (matchesName || sym.regexPattern.test(trimmed)) {
          if (!extracted.some((e) => e.id === sym.id) && !negated.includes(sym.id)) {
            extracted.push({
              id: sym.id,
              name: sym.patientFriendlyName,
              text: chip,
              negated: false,
            });
          }
          break;
        }
      }
    }
  }

  return { extracted, negated };
}

/**
 * Evaluates priority emergency triage rules before differential condition matching.
 */
export function evaluateEmergencyTriage(positiveSymptomIds: string[]): EmergencyEvaluation {
  const positiveSet = new Set(positiveSymptomIds);
  const reasons: string[] = [];

  for (const rule of EMERGENCY_RULES) {
    const hits = rule.symptomIds.filter((id) => positiveSet.has(id)).length;
    if (hits >= rule.minHits) {
      reasons.push(rule.reason);
    }
  }

  const isEmergency = reasons.length > 0;
  return {
    isEmergency,
    reasons,
    actionPlan: isEmergency
      ? "CRITICAL WARNING: Call 112 (Emergency Services) immediately or proceed to the nearest Emergency Center. Do not wait for a routine appointment."
      : "No acute emergency indicators identified. Proceeding with routine differential clinical decision support.",
  };
}

/**
 * Scans positive symptoms for cancer warning signs and returns specialized guidance.
 */
export function detectCancerWarningFlags(positiveSymptomIds: string[]): {
  symptomId: string;
  warningName: string;
  advice: string;
}[] {
  const flags: { symptomId: string; warningName: string; advice: string }[] = [];
  const positiveSet = new Set(positiveSymptomIds);

  for (const sym of GLOBAL_SYMPTOMS) {
    if (sym.isCancerWarningSign && positiveSet.has(sym.id)) {
      flags.push({
        symptomId: sym.id,
        warningName: sym.patientFriendlyName,
        advice: `This is a clinically recognized warning sign that warrants comprehensive examination, diagnostic imaging, and tissue evaluation. Symptoms alone can neither confirm nor rule out cancer.`,
      });
    }
  }

  return flags;
}

/**
 * Matches extracted positive symptoms against the multi-specialty clinical disease knowledge base.
 */
export function matchDiseases(positiveSymptomIds: string[]): MatchedDiseaseResult[] {
  if (!positiveSymptomIds || positiveSymptomIds.length === 0) return [];

  const positiveSet = new Set(positiveSymptomIds);
  const results: MatchedDiseaseResult[] = [];

  for (const disease of GLOBAL_DISEASES) {
    const matchedCore = disease.coreSymptoms.filter((s) => positiveSet.has(s));
    const matchedAssociated = disease.associatedSymptoms.filter((s) => positiveSet.has(s));

    const totalMatchedCount = matchedCore.length + matchedAssociated.length;
    if (totalMatchedCount === 0) continue;

    // Core symptoms carry double weight in clinical pattern matching
    const weightedMatched = matchedCore.length * 2.0 + matchedAssociated.length * 1.0;
    const weightedDiseaseTotal = disease.coreSymptoms.length * 2.0 + disease.associatedSymptoms.length * 1.0;
    const weightedPatientTotal = positiveSymptomIds.length * 1.5;

    // Harmonic overlap (F1)
    const precision = weightedMatched / weightedPatientTotal;
    const recall = weightedMatched / weightedDiseaseTotal;
    const f1 = (2 * precision * recall) / (precision + recall);

    // Score bounded between 15% and 98% (never claiming 100% false certainty)
    const matchScore = Math.min(98, Math.max(15, Math.round(f1 * 100)));

    // Classic symptoms missing from patient presentation
    const missingClassic = disease.coreSymptoms.filter((s) => !positiveSet.has(s));

    // Active cancer warning signs
    const activeCancerWarnings = (disease.cancerWarningSigns || []).filter(() =>
      disease.category === "Oncology"
    );

    let clinicalRecommendation = disease.nextSteps;
    let cancerSafetyDisclaimer: string | undefined = undefined;

    if (disease.category === "Oncology") {
      cancerSafetyDisclaimer =
        "IMPORTANT ONCOLOGY NOTICE: Symptoms alone can neither confirm nor reliably exclude cancer. A definitive diagnosis requires physical examination, specialized imaging (e.g. CT/MRI/Mammography), and histological tissue biopsy by an Oncologist.";
    }

    results.push({
      disease,
      matchScore,
      matchedCoreSymptoms: matchedCore,
      matchedAssociatedSymptoms: matchedAssociated,
      missingClassicSymptoms: missingClassic,
      activeCancerWarnings,
      urgency: disease.urgency,
      clinicalRecommendation,
      cancerSafetyDisclaimer,
    });
  }

  // Sort by match score descending, then by matched core symptoms
  results.sort(
    (a, b) =>
      b.matchScore - a.matchScore ||
      b.matchedCoreSymptoms.length - a.matchedCoreSymptoms.length
  );

  // If patient reported >= 2 symptoms, prioritize conditions matching >= 2 symptoms
  if (positiveSymptomIds.length >= 2) {
    const multiMatch = results.filter(
      (r) => r.matchedCoreSymptoms.length + r.matchedAssociatedSymptoms.length >= 2
    );
    if (multiMatch.length > 0) {
      return multiMatch.slice(0, 5);
    }
  }

  return results.slice(0, 4);
}

/**
 * Top-level multi-symptom clinical intelligence assessment runner.
 */
export function runSymptomIntelligence(
  transcript: string,
  explicitChips?: string[]
): MultiSymptomDiagnosisReport {
  const { extracted, negated } = extractSymptoms(transcript, explicitChips);
  const positiveSymptomIds = extracted.filter((e) => !e.negated).map((e) => e.id);

  // 1. Emergency Evaluation first
  const emergencyEvaluation = evaluateEmergencyTriage(positiveSymptomIds);

  // 2. Cancer Warning Sign Detection
  const cancerWarningFlagsDetected = detectCancerWarningFlags(positiveSymptomIds);

  // 3. Differential Disease Matching
  const possibleConditions = matchDiseases(positiveSymptomIds);

  // 4. Department & Specialist Recommendation
  let suggestedDepartment = "General Medicine";
  const altDeptSet = new Set<string>();

  if (emergencyEvaluation.isEmergency) {
    suggestedDepartment = "Emergency Center";
  } else if (possibleConditions.length > 0) {
    const topCondition = possibleConditions[0];
    suggestedDepartment = topCondition.disease.department;

    for (const res of possibleConditions.slice(1)) {
      if (res.disease.department !== suggestedDepartment && res.disease.department !== "Emergency Center") {
        altDeptSet.add(res.disease.department);
      }
    }
  }

  const alternativeDepartments = Array.from(altDeptSet).slice(0, 3);

  // 5. Clinical Summary
  let explanation = "";
  if (emergencyEvaluation.isEmergency) {
    explanation = `Emergency warning identified: ${emergencyEvaluation.reasons.join(" ")} Please call 112 or visit the nearest Emergency Center immediately.`;
  } else if (cancerWarningFlagsDetected.length > 0) {
    explanation = `Recognized potential warning sign(s) detected: ${cancerWarningFlagsDetected.map((f) => f.warningName).join(", ")}. While these are often caused by benign conditions, formal specialist evaluation is strongly recommended.`;
  } else if (possibleConditions.length > 0) {
    const top = possibleConditions[0];
    explanation = `Based on your combination of symptoms, the primary clinical correlation is ${top.disease.name} (${top.matchScore}% correlation). Recommended department: ${suggestedDepartment}.`;
  } else {
    explanation = `No specific pattern from our clinical knowledge base matched this exact combination of symptoms. Many medical conditions share non-specific symptoms. A General Physician consultation is recommended.`;
  }

  const disclaimer =
    "This clinical intelligence tool provides preliminary decision support based on WHO ICD-11 terminology and MedlinePlus references. It is NOT a confirmed medical diagnosis and cannot replace an in-person physical examination and diagnostic evaluation by a licensed physician.";

  return {
    extractedSymptoms: extracted,
    negatedSymptoms: negated,
    emergencyEvaluation,
    cancerWarningFlagsDetected,
    possibleConditions,
    suggestedDepartment,
    alternativeDepartments,
    explanation,
    disclaimer,
    kbMetadata: {
      totalDiseases: GLOBAL_DISEASES.length,
      totalSymptoms: GLOBAL_SYMPTOMS.length,
      icd11Standard: KB_METADATA.icd11Release,
      version: KB_METADATA.version,
      sources: Object.values(MEDICAL_SOURCES),
    },
  };
}
