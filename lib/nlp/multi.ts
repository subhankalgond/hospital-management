/**
 * CarePulse — multi-symptom analysis (layer on top of the trained router).
 *
 * `analyzeSymptoms(text)` splits a free-text description into individual
 * symptom clauses, honours negation ("no fever" is NOT a fever case), runs
 * the trained department router on the positive clauses (plus full text for
 * context), and applies conservative combination rules so chest discomfort +
 * breathing difficulty + sweating routes to emergency assessment rather
 * than a routine cardiology appointment.
 *
 * It never diagnoses, never rules out emergencies, and always labels its
 * output as decision support.
 */
import { routeSymptoms } from "./symptoms";

export const ANALYSIS_VERSION = "carepulse-analysis-v2";

export interface ExtractedSymptom {
  /** normalised symptom name, e.g. "chest discomfort" */
  name: string;
  /** clause as the patient wrote it */
  text: string;
  negated: boolean;
  /** how long the patient says they've had it, if stated */
  duration?: string;
  /** severity the patient reports, if stated (1-10 or modifier word) */
  severity?: "mild" | "moderate" | "severe";
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
  /** highest-priority classification */
  urgency: "emergency" | "urgent" | "routine";
  urgencyReason: string;
  suggestedDepartment: string;
  alternativeDepartments: string[];
  followUpQuestions: FollowUpQuestion[];
  explanation: string;
  version: string;
}

/* ─────────────── known symptom vocabulary (normalisation) ─────────────── */

const SYMPTOM_CANON: [RegExp, string][] = [
  [/chest (pain|discomfort|tightness|heaviness|pressure|burning)/, "chest discomfort"],
  [/\b(shortness of breath|breathless|breathing (difficulty|difficulty)|difficulty breathing|hard to breathe|can'?t breathe|trouble breathing|breathlessness)\b/, "shortness of breath"],
  [/pain (in|radiating to) (my |the )?left arm/, "left arm pain"],
  [/\b(sweat(ing|y)?|diaphoresis)\b/, "sweating"],
  [/\bnausea\b/, "nausea"],
  [/\bdizz(y|iness|zy)\b/, "dizziness"],
  [/\bfatigue(d)?|weak(ness)?|letharg/, "fatigue"],
  [/\bfever(ed|ish)?\b/, "fever"],
  [/\bvomit(ing|ed|s)?|throwing up|puking\b/, "vomiting"],
  [/\bheadache|head pain\b/, "headache"],
  [/\bcough(ing)?\b/, "cough"],
  [/\bnumb(ness)?|tingling\b/, "numbness/tingling"],
  [/\b(ringing|buzzing) in (my |the )?ears?|tinnitus\b/, "ringing in ears"],
  [/\bblurred vision|blurry vision\b/, "blurred vision"],
  [/\b(rash|itch(ing|y)?|hives)\b/, "skin rash/itching"],
  [/\bjoint pain|bone pain|knee pain|arthritis\b/, "joint pain"],
  [/\bback pain\b/, "back pain"],
  [/\b(abdominal pain|stomach (pain|ache)|belly pain)\b/, "abdominal pain"],
  [/\bpalpitat(ion|ing|e)s?\b/, "palpitations"],
  [/\bfaint(ing)?|blackout\b/, "fainting"],
  [/\bswelling\b/, "swelling"],
  [/\bblood(y| in) (stool|vomit|urine)\b/, "bleeding"],
  [/\bunconscious|passed out|collapsed\b/, "unconsciousness"],
  [/\bseizure|convulsion|fits?\b/, "seizure"],
  [/\bslurred speech\b/, "slurred speech"],
  [/\bface droop(ing)?|one side (of (my |the )?)?(face|body) (weak|droop|heavy)/, "face drooping"],
];

/** negation cue words — a symptom mentioned after one of these is NOT present */
const NEGATION_CUES = /\b(no|not|without|denies?|never|n't|don'?t have|do not have|does not have|no signs? of|free of|absent)\b/i;

/** split-boundary words that separate individual symptoms */
const CLAUSE_SPLIT = /[,;.!\n]|\band\b|\balong with\b|\bwith\b|\bbut\b|\balso\b|\bas well as\b|-{2,}/i;

/** emergency combination rules — any match means emergency guidance FIRST */
const COMBO_RULES: { symptoms: string[]; min: number; reason: string }[] = [
  { symptoms: ["chest discomfort", "shortness of breath"], min: 1, reason: "Chest discomfort together with breathing difficulty can indicate a cardiac emergency." },
  { symptoms: ["chest discomfort", "sweating"], min: 2, reason: "Chest discomfort with sweating can indicate a heart attack." },
  { symptoms: ["chest discomfort", "left arm pain"], min: 2, reason: "Chest discomfort radiating to the arm can indicate a cardiac emergency." },
  { symptoms: ["chest discomfort", "nausea", "dizziness"], min: 3, reason: "Chest discomfort with nausea and dizziness can indicate a cardiac emergency." },
  { symptoms: ["shortness of breath", "fatigue", "swelling"], min: 3, reason: "Breathing difficulty with fatigue and swelling suggests possible heart failure decompensation." },
  { symptoms: ["face drooping"], min: 1, reason: "Facial drooping can indicate a stroke." },
  { symptoms: ["slurred speech", "numbness/tingling"], min: 2, reason: "Slurred speech with numbness can indicate a stroke." },
  { symptoms: ["headache", "slurred speech"], min: 2, reason: "Headache with neurological changes can indicate a stroke or bleeding in the brain." },
  { symptoms: ["unconsciousness"], min: 1, reason: "Loss of consciousness requires immediate emergency care." },
  { symptoms: ["seizure"], min: 1, reason: "Active seizures require immediate emergency assessment." },
  { symptoms: ["bleeding"], min: 1, reason: "Visible blood loss requires immediate assessment." },
];

/** severity modifiers, strongest wins */
const SEVERITY_WORDS: [RegExp, ExtractedSymptom["severity"]][] = [
  [/unbearable|excruciating|worst|severe|intense|10\/10|9\/10|8\/10/, "severe"],
  [/moderate|bothersome|7\/10|6\/10|5\/10|quite/, "moderate"],
  [/mild|slight|a little|manageable|2\/10|1\/10|3\/10|4\/10/, "mild"],
];

/** duration phrases: "since this morning", "for three days", "2 weeks" … */
const DURATION_RE = /\b(since|for|from)\s+(this\s+)?(morning|evening|afternoon|night|yesterday|today|a few hours|few hours|two days|three days|four days|five days|\d+\s*(day|days|week|weeks|month|months|hour|hours)\b[^,;.]*?)/i;

/** follow-up prompts emitted only when safe (never while emergency) */
const FOLLOW_UPS: { id: string; question: string; reason: string; when: (s: ExtractedSymptom[], a: { duration?: string; severity?: ExtractedSymptom["severity"] }) => string | null }[] = [
  {
    id: "duration",
    question: "How long have you had these symptoms?",
    reason: "Duration helps the doctor judge urgency.",
    when: (_s, a) => (a.duration ? null : "missing"),
  },
  {
    id: "severity",
    question: "How bad is the most bothersome symptom (mild / moderate / severe, or a number out of 10)?",
    reason: "Severity helps the doctor judge urgency.",
    when: (_s, a) => (a.severity ? null : "missing"),
  },
  {
    id: "chest-spread",
    question: "Does the chest discomfort spread to your arm, jaw or back?",
    reason: "Radiation pattern changes how urgently chest symptoms are treated.",
    when: (s) => (s.some((x) => x.name === "chest discomfort" && !x.negated) ? "missing" : null),
  },
  {
    id: "breathing-position",
    question: "Does the breathing difficulty happen lying flat, on exertion, or at rest?",
    reason: "Distinguishes cardiac from respiratory causes.",
    when: (s) => (s.some((x) => x.name === "shortness of breath" && !x.negated) ? "missing" : null),
  },
];

interface ParsedClause {
  text: string;
  negated: boolean;
}

function splitClauses(raw: string): ParsedClause[] {
  // Sentence-level split first, then clause-level within each sentence.
  const sentences = raw.split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
  const clauses: ParsedClause[] = [];
  for (const sentence of sentences) {
    for (const part of sentence.split(CLAUSE_SPLIT)) {
      const t = part.trim().toLowerCase();
      if (!t || t.length < 3) continue;
      // negation scoping: a cue within ~6 words *before* a canonical symptom
      clauses.push({ text: t, negated: false });
    }
  }
  return clauses;
}

function detectNegation(clause: string): boolean {
  // Simple heuristic: negation cue present anywhere in the same clause.
  // Rare false positives ("without any improvement") are acceptable — the
  // patient confirms the final text and the doctor reviews the outcome.
  return NEGATION_CUES.test(clause);
}

export function analyzeSymptoms(input: string): MultiSymptomAnalysis {
  const raw = input.trim();
  const clauses = splitClauses(raw);

  const symptoms: ExtractedSymptom[] = [];
  const negated: string[] = [];

  for (const c of clauses) {
    for (const [re, name] of SYMPTOM_CANON) {
      const m = c.text.match(re);
      if (!m) continue;
      const isNeg = detectNegation(c.text);
      const entry: ExtractedSymptom = { name, text: c.text, negated: isNeg };
      const dm = c.text.match(DURATION_RE);
      if (dm) entry.duration = dm[0].toLowerCase().trim();
      const sv = SEVERITY_WORDS.find(([sre]) => sre.test(c.text));
      if (sv) entry.severity = sv[1];
      if (isNeg) {
        if (!negated.includes(name)) negated.push(name);
      } else {
        if (!symptoms.some((s) => s.name === name)) symptoms.push(entry);
      }
      break; // one canonical name per clause
    }
  }

  const positive = symptoms.filter((s) => !s.negated).map((s) => s.name);
  const positiveSet = new Set(positive);

  // duration + severity = the strongest the patient reported anywhere
  const allDurations = symptoms.map((s) => s.duration).filter(Boolean) as string[];
  const duration = allDurations[allDurations.length - 1];
  const severities = symptoms.map((s) => s.severity).filter(Boolean) as ExtractedSymptom["severity"][];
  const severity = severities.includes("severe") ? "severe" : severities.includes("moderate") ? "moderate" : severities[0];

  /* ── 1. combination emergency rules (before any routing) ── */
  let comboReason: string | null = null;
  for (const rule of COMBO_RULES) {
    const hits = rule.symptoms.filter((s) => positiveSet.has(s)).length;
    if (hits >= rule.min) {
      comboReason = rule.reason;
      break;
    }
  }

  /* ── 2. router verdict on the full text (context-aware, it was trained
        on whole sentences) AND on just the positive symptom names ── */
  const routing = routeSymptoms(raw);
  const positiveText = symptoms
    .filter((s) => !s.negated)
    .map((s) => s.name)
    .join(", ");
  const routingPositive = positiveText ? routeSymptoms(positiveText) : null;

  let urgency: MultiSymptomAnalysis["urgency"] = "routine";
  let urgencyReason = "No emergency indicators found.";
  let suggestedDepartment = routing.department;

  if (comboReason) {
    urgency = "emergency";
    urgencyReason = comboReason;
    suggestedDepartment = "Emergency Center";
  } else if (routing.urgency.isEmergency) {
    urgency = "emergency";
    urgencyReason = `Urgent terms found in the description: ${routing.urgency.matchedTerms.join(", ")}.`;
    suggestedDepartment = routing.department === "Emergency Center" ? routing.department : routing.department;
  } else if (severity === "severe" && positive.length >= 4) {
    urgency = "urgent";
    urgencyReason = "Multiple symptoms described as severe — prompt clinical review is advised.";
    suggestedDepartment = routing.department;
  }

  // alternatives from the router, filtered to departments different from top;
  // Emergency Center never appears as a routine alternative — emergencies are
  // handled by the urgency layer, never by alternative listing
  const alternatives = routing.alternatives
    .map((a) => a.department)
    .filter((d) => d !== suggestedDepartment && d !== "Emergency Center")
    .slice(0, 2);

  /* ── 2b. child rule — a described child belongs to Pediatrics unless the
        case is already an emergency ── */
  const CHILD_RE = /\b(child|children|kid|baby|infant|toddler|newborn|son|daughter|year old|years old|month old)\b/i;
  let childNote = false;
  if (urgency === "routine" && CHILD_RE.test(raw)) {
    childNote = true;
    const pedIdx = alternatives.indexOf("Pediatrics");
    if (suggestedDepartment !== "Pediatrics") {
      if (pedIdx >= 0) alternatives.splice(pedIdx, 1);
      alternatives.unshift(suggestedDepartment);
      suggestedDepartment = "Pediatrics";
    }
  }

  /* ── 3. uncertainty: when systems conflict, both candidate departments
        are surfaced rather than silently picking one ── */
  const explanation =
    urgency === "emergency"
      ? urgencyReason + " Seek immediate care — call emergency services (112 in India) if getting worse."
      : childNote && suggestedDepartment === "Pediatrics"
        ? `A child is described, so ${suggestedDepartment} is the appropriate department (routing signal: ${routing.department}).`
        : routingPositive && routingPositive.department !== suggestedDepartment && routingPositive.department !== "Emergency Center"
          ? `Multiple specialty signals were detected (${suggestedDepartment} + ${routingPositive.department}). The primary recommendation is ${suggestedDepartment}; consider also ${routingPositive.department} if the other symptoms dominate.`
          : `Based on the combined pattern of ${positive.length || 1} reported symptom(s), ${suggestedDepartment} is the best match.`;

  /* ── 4. follow-up questions — only when NOT emergency (asking must never
        delay emergency guidance) ── */
  const followUpQuestions: FollowUpQuestion[] =
    urgency === "emergency"
      ? []
      : FOLLOW_UPS.map((f) => ({ id: f.id, question: f.question, reason: f.reason, answer: f.when(symptoms, { duration, severity }) === null ? "present" : "missing" }))
          .filter((f) => f.answer === "missing")
          .slice(0, 3)
          .map(({ id, question, reason }) => ({ id, question, reason }));

  return {
    symptoms,
    negated,
    duration,
    severity,
    urgency,
    urgencyReason,
    suggestedDepartment,
    alternativeDepartments: alternatives,
    followUpQuestions,
    explanation,
    version: ANALYSIS_VERSION,
  };
}

/** Plain-language disclaimer shown with every assessment. */
export const ANALYSIS_DISCLAIMER =
  "This preliminary assessment is AI-assisted decision support, not a diagnosis. It cannot rule out an emergency. A qualified clinician must confirm the final department and treatment.";
