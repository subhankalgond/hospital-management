/**
 * CarePulse — multi-symptom analysis & clinical decision support engine.
 *
 * Analyzes multiple simultaneously reported symptoms, honours negation,
 * matches clinical symptom combinations against an evidence-based knowledge base
 * to surface candidate conditions, computes genuine overlap scores, flags
 * emergency triage red flags (112 / Emergency Center), and recommends matching
 * hospital specialties and doctors.
 *
 * It provides decision support, never claims a definitive diagnosis,
 * and always emphasizes professional clinician evaluation.
 */
import { routeSymptoms } from "./symptoms";

export const ANALYSIS_VERSION = "carepulse-multisymptom-v3";

export interface ExtractedSymptom {
  /** normalised symptom name, e.g. "chest discomfort" */
  name: string;
  /** clause or text as the patient entered it */
  text: string;
  negated: boolean;
  /** how long the patient reports having it */
  duration?: string;
  /** severity reported (mild | moderate | severe) */
  severity?: "mild" | "moderate" | "severe";
}

export interface MatchedCondition {
  id: string;
  name: string;
  department: string;
  urgency: "emergency" | "urgent" | "routine";
  description: string;
  matchScore: number; // 0..100 percentage based on genuine harmonic mean overlap
  matchedSymptoms: string[];
  otherSymptoms: string[];
  nextSteps: string;
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
  /** highest-priority triage classification */
  urgency: "emergency" | "urgent" | "routine";
  urgencyReason: string;
  suggestedDepartment: string;
  alternativeDepartments: string[];
  possibleConditions: MatchedCondition[];
  followUpQuestions: FollowUpQuestion[];
  explanation: string;
  version: string;
}

/* ─────────────── canonical symptom vocabulary & regex normalisation ─────────────── */

export const SYMPTOM_CANON: [RegExp, string][] = [
  [/chest\s*(pain|discomfort|tightness|heaviness|pressure|burning|crushing)/i, "chest discomfort"],
  [/\b(shortness of breath|breathless|breathing\s*difficult(y)?|difficult(y)?\s*breathing|hard to breathe|can'?t breathe|trouble breathing|breathlessness|wheez(ing)?|dyspnea)\b/i, "shortness of breath"],
  [/pain\s*(in|radiating to)\s*(my\s+|the\s+)?left arm/i, "left arm pain"],
  [/\b(sweat(ing|y)?|diaphoresis|cold sweats?)\b/i, "sweating"],
  [/\bnausea|nauseous|feeling sick|feel sick\b/i, "nausea"],
  [/\bdizz(y|iness|zy)|lightheaded(ness)?|vertigo\b/i, "dizziness"],
  [/\bfatigue(d)?|weak(ness)?|letharg(ic|y)?|tired(ness)?|exhaust(ed|ion)\b/i, "fatigue"],
  [/\b(high\s+)?fever(ed|ish)?|pyrexia|chills|shivering|high temp(erature)?\b/i, "fever"],
  [/\bvomit(t)?(ing|ed|s)?|vomitting|throwing up|puking|threw up|emesis\b/i, "vomiting"],
  [/\bhead\s*e?a+c?h+e?s?|headache|headeaache|head pain|migraine|throbbing head\b/i, "headache"],
  [/\b(pain behind the eyes|retro-?orbital pain|eye socket pain|hurting behind eyes|pain behind eyes|ache behind eyes)\b/i, "pain behind the eyes"],
  [/\b(body\s*a(a)?che(s)?|bodyache(s)?|myalgia|muscle ache(s)?|generalized body pain|body soreness|sore muscles)\b/i, "body ache"],
  [/\b(skin\s*)?rash(es)?|itch(ing|y)?|hives|erythema|skin spots|petechiae|urticaria\b/i, "skin rash"],
  [/\bcough(ing)?|phlegm|sputum\b/i, "cough"],
  [/\bjoint\s*pain|bone\s*pain|knee\s*pain|arthritis|arthralgia|painful joints?\b/i, "joint pain"],
  [/\bswelling|swollen|edema|puffy|puffiness\b/i, "swelling"],
  [/\b(difficulty|unable to|hard to|cannot|can'?t|trouble)\s*(mov(e|ing)|walk(ing)?)|stiff(ness)?|limited mobility\b/i, "difficulty moving"],
  [/\bsore\s*throat|pharyngitis|throat\s*pain|pain\s*swallowing\b/i, "sore throat"],
  [/\brunny\s*nose|nasal\s*congestion|blocked\s*nose|sneezing|cold|coryza\b/i, "runny nose"],
  [/\b(abdominal\s*pain|stomach\s*(pain|ache)|belly\s*pain|cramps?|tummy ache)\b/i, "abdominal pain"],
  [/\bdiarrhea|diarrhoea|loose\s*(motions?|stools?)|watery stools?\b/i, "diarrhea"],
  [/\bloss of appetite|anorexia|not hungry|reduced appetite\b/i, "loss of appetite"],
  [/\bblurred vision|blurry vision|vision loss|double vision\b/i, "blurred vision"],
  [/\bpalpitat(ion|ing|e)s?|racing\s*(heart|pulse)|fluttering heart\b/i, "palpitations"],
  [/\bback\s*pain|lower\s*back\s*pain|lumbago\b/i, "back pain"],
  [/\bburning\s*urination|painful\s*urination|dysuria|burning pee|frequent urination\b/i, "burning urination"],
  [/\bnumb(ness)?|tingling|pins and needles|paresthesia\b/i, "numbness/tingling"],
  [/\bslurred\s*speech|trouble\s*speaking|difficulty talking\b/i, "slurred speech"],
  [/\bface\s*droop(ing)?|one side (of (my |the )?)?(face|body) (weak|droop|heavy)\b/i, "face drooping"],
  [/\bfaint(ing)?|blackout|syncope|passed out\b/i, "fainting"],
  [/\bunconscious(ness)?|loss of consciousness|unresponsive|collapsed\b/i, "unconsciousness"],
  [/\bseizure(s)?|convulsion(s)?|fits?\b/i, "seizure"],
  [/\bbleed(ing)?|blood in (stool|vomit|urine)|bleeding gums|hemorrhage\b/i, "bleeding"],
];

/** negation cue words — a symptom mentioned near one of these is flagged as absent */
const NEGATION_CUES = /\b(no|not|without|denies?|never|n't|don'?t have|do not have|does not have|no signs? of|free of|absent)\b/i;

/** split-boundary tokens separating individual symptom clauses */
const CLAUSE_SPLIT = /[,;.!\n]|\band\b|\balong with\b|\bwith\b|\bbut\b|\balso\b|\bas well as\b|\bplus\b|-{2,}/i;

/** emergency combination and red-flag rules */
const COMBO_RULES: { symptoms: string[]; min: number; reason: string }[] = [
  { symptoms: ["chest discomfort", "shortness of breath"], min: 2, reason: "Chest discomfort accompanied by shortness of breath indicates a potential acute cardiac or pulmonary emergency." },
  { symptoms: ["chest discomfort", "sweating"], min: 2, reason: "Chest discomfort with diaphoresis (sweating) is a classic indicator of acute coronary syndrome (heart attack)." },
  { symptoms: ["chest discomfort", "left arm pain"], min: 2, reason: "Chest discomfort radiating to the left arm is a high-risk sign of acute myocardial infarction." },
  { symptoms: ["chest discomfort", "nausea", "dizziness"], min: 3, reason: "Chest discomfort with nausea and dizziness warrants immediate emergency evaluation." },
  { symptoms: ["shortness of breath", "fatigue", "swelling"], min: 3, reason: "Difficulty breathing with fatigue and swelling suggests acute congestive heart failure or pulmonary congestion." },
  { symptoms: ["shortness of breath"], min: 1, reason: "Acute respiratory distress or difficulty breathing requires prompt emergency assessment to maintain airway and oxygenation." },
  { symptoms: ["chest discomfort"], min: 1, reason: "Acute chest discomfort warrants urgent clinical evaluation to rule out acute cardiac ischemia." },
  { symptoms: ["face drooping"], min: 1, reason: "Sudden facial weakness or drooping is a critical stroke warning sign requiring immediate emergency intervention." },
  { symptoms: ["slurred speech"], min: 1, reason: "Sudden speech slurring or difficulty talking is a neurological emergency indicator (potential acute stroke)." },
  { symptoms: ["slurred speech", "numbness/tingling"], min: 2, reason: "Speech difficulty combined with numbness indicates acute cerebrovascular compromise (stroke)." },
  { symptoms: ["headache", "slurred speech"], min: 2, reason: "Severe headache accompanied by slurred speech suggests an acute intracranial event." },
  { symptoms: ["unconsciousness"], min: 1, reason: "Loss of consciousness is a critical medical emergency requiring immediate resuscitation." },
  { symptoms: ["seizure"], min: 1, reason: "Active or recurrent seizures require immediate emergency stabilization." },
  { symptoms: ["bleeding"], min: 1, reason: "Active visible bleeding or internal hemorrhage signs require immediate emergency assessment." },
];

/** severity modifiers */
const SEVERITY_WORDS: [RegExp, ExtractedSymptom["severity"]][] = [
  [/unbearable|excruciating|worst|severe|intense|10\/10|9\/10|8\/10/, "severe"],
  [/moderate|bothersome|7\/10|6\/10|5\/10|quite/, "moderate"],
  [/mild|slight|a little|manageable|2\/10|1\/10|3\/10|4\/10/, "mild"],
];

/** duration phrases */
const DURATION_RE = /\b(since|for|from)\s+(this\s+)?(morning|evening|afternoon|night|yesterday|today|a few hours|few hours|two days|three days|four days|five days|\d+\s*(day|days|week|weeks|month|months|hour|hours)\b[^,;.]*?)/i;

/** follow-up questions for non-emergencies */
const FOLLOW_UPS: { id: string; question: string; reason: string; when: (s: ExtractedSymptom[], a: { duration?: string; severity?: ExtractedSymptom["severity"] }) => string | null }[] = [
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
    question: "Does the chest pain or tightness radiate to your neck, jaw, back, or left arm?",
    reason: "Radiation of discomfort differentiates cardiac ischemia from musculoskeletal pain.",
    when: (s) => (s.some((x) => x.name === "chest discomfort" && !x.negated) ? "missing" : null),
  },
  {
    id: "breathing-position",
    question: "Does your breathing difficulty worsen when lying flat or during mild walking?",
    reason: "Orthopnea helps distinguish pulmonary from cardiovascular etiologies.",
    when: (s) => (s.some((x) => x.name === "shortness of breath" && !x.negated) ? "missing" : null),
  },
];

/* ─────────────── clinical disease knowledge base ─────────────── */

export interface DiseaseProfile {
  id: string;
  name: string;
  department: string;
  urgency: "emergency" | "urgent" | "routine";
  description: string;
  symptoms: string[];
  otherAssociatedSymptoms: string[];
  nextSteps: string;
}

export const DISEASE_KNOWLEDGE_BASE: DiseaseProfile[] = [
  {
    id: "dengue-fever",
    name: "Dengue Fever",
    department: "General Medicine",
    urgency: "urgent",
    description: "An acute mosquito-borne viral infection (Flavivirus) characteristically causing high grade fever, retro-orbital eye pain, severe myalgia/arthralgia ('breakbone fever'), nausea, vomiting, and a maculopapular skin rash.",
    symptoms: ["fever", "body ache", "headache", "pain behind the eyes", "nausea", "vomiting", "skin rash"],
    otherAssociatedSymptoms: ["fatigue", "loss of appetite", "joint pain", "bleeding"],
    nextSteps: "Consult an Internal Medicine specialist promptly. Dengue serology (NS1 antigen / IgM antibody) and a complete blood count (CBC) to monitor platelet counts and hematocrit are strongly indicated. Maintain oral hydration and avoid aspirin/NSAIDs.",
  },
  {
    id: "viral-uri-influenza",
    name: "Viral Upper Respiratory Infection / Influenza",
    department: "General Medicine",
    urgency: "routine",
    description: "A common viral illness affecting the upper respiratory tract and airways, presenting with acute fever, generalized body ache, headache, cough, pharyngitis, and fatigue.",
    symptoms: ["fever", "cough", "sore throat", "runny nose", "body ache", "headache", "fatigue"],
    otherAssociatedSymptoms: ["loss of appetite", "chills"],
    nextSteps: "Rest, ensure plentiful hydration, and consult a General Physician if high fever persists beyond 3 days or if breathing difficulties develop.",
  },
  {
    id: "acute-bronchitis-asthma",
    name: "Acute Bronchitis / Respiratory Distress",
    department: "General Medicine",
    urgency: "urgent",
    description: "Inflammation of the tracheobronchial tree or reactive airway constriction leading to persistent cough, dyspnea, low fever, and chest tightness.",
    symptoms: ["cough", "shortness of breath", "fever", "fatigue"],
    otherAssociatedSymptoms: ["chest discomfort", "body ache"],
    nextSteps: "Seek urgent medical evaluation. Pulse oximetry (SpO2), chest auscultation, and possible chest radiography are recommended to evaluate airway patency.",
  },
  {
    id: "acute-coronary-syndrome",
    name: "Acute Coronary Syndrome (Heart Attack / Angina)",
    department: "Cardiology",
    urgency: "emergency",
    description: "Critical cardiac ischemia where blood flow to the myocardium is acutely restricted, frequently presenting with chest pressure, radiation to the left arm, diaphoresis, dyspnea, and nausea.",
    symptoms: ["chest discomfort", "shortness of breath", "sweating", "left arm pain", "nausea", "dizziness"],
    otherAssociatedSymptoms: ["palpitations", "fatigue", "fainting"],
    nextSteps: "CRITICAL EMERGENCY: Call 112 or proceed immediately to the Emergency Center. Do not drive yourself. Immediate ECG, continuous cardiac monitoring, and serum Troponin evaluation are required.",
  },
  {
    id: "orthopedic-sprain-injury",
    name: "Musculoskeletal Strain / Joint Sprain / Arthritis",
    department: "Orthopedics",
    urgency: "routine",
    description: "Mechanical injury, ligamentous sprain, soft-tissue inflammation, or joint degeneration causing localized pain, swelling, and diminished movement range.",
    symptoms: ["joint pain", "swelling", "difficulty moving", "body ache", "back pain"],
    otherAssociatedSymptoms: ["stiffness", "tenderness"],
    nextSteps: "Schedule an evaluation with an Orthopedic Surgeon. Practice the RICE protocol (Rest, Ice, Compression, Elevation) while avoiding strenuous weight bearing pending clinical examination and X-rays.",
  },
  {
    id: "acute-gastroenteritis",
    name: "Acute Gastroenteritis / Food-Borne Infection",
    department: "General Medicine",
    urgency: "routine",
    description: "Gastrointestinal tract inflammation caused by viral, bacterial, or toxic pathogens, presenting with nausea, vomiting, abdominal cramping, and loose watery stools.",
    symptoms: ["nausea", "vomiting", "abdominal pain", "diarrhea", "fever", "fatigue"],
    otherAssociatedSymptoms: ["loss of appetite", "dizziness"],
    nextSteps: "Maintain aggressive oral electrolyte rehydration (ORS). Consult a General Physician if vomiting precludes oral fluid intake or if high fever or blood in stool is noted.",
  },
  {
    id: "migraine-tension-headache",
    name: "Migraine / Neurological Headache",
    department: "Neurology",
    urgency: "routine",
    description: "Recurrent neurovascular headache characterized by throbbing unilateral or bilateral pain, often accompanied by sensory sensitivity, nausea, dizziness, or visual aura.",
    symptoms: ["headache", "nausea", "blurred vision", "dizziness"],
    otherAssociatedSymptoms: ["vomiting", "fatigue"],
    nextSteps: "Consult a Neurologist or Physician for neurological examination, trigger evaluation, and tailored abortive or preventive headache therapy.",
  },
  {
    id: "allergic-reaction-urticaria",
    name: "Allergic Dermatitis / Urticaria",
    department: "Dermatology",
    urgency: "routine",
    description: "Hypersensitivity immune reaction of the integumentary system manifesting as pruritic erythema, hives (wheals), or localized soft-tissue swelling.",
    symptoms: ["skin rash", "swelling"],
    otherAssociatedSymptoms: ["nausea", "dizziness"],
    nextSteps: "Consult a Dermatologist. If you notice any facial swelling, tongue enlargement, or throat tightness, seek immediate emergency care as it could indicate anaphylaxis.",
  },
  {
    id: "urinary-tract-infection",
    name: "Urinary Tract Infection (UTI)",
    department: "General Medicine",
    urgency: "routine",
    description: "Bacterial infection of the bladder or upper urinary tract presenting with painful burning micturition, suprapubic or flank discomfort, and low fever.",
    symptoms: ["burning urination", "abdominal pain", "fever", "back pain"],
    otherAssociatedSymptoms: ["nausea", "fatigue"],
    nextSteps: "Consult a Physician. A clean-catch routine urine analysis and urine culture are advised to guide targeted antimicrobial therapy.",
  },
  {
    id: "acute-cerebrovascular-event",
    name: "Acute Cerebrovascular Event (Stroke / TIA)",
    department: "Neurology",
    urgency: "emergency",
    description: "Sudden focal impairment of cerebral blood circulation producing acute neurological deficits such as facial asymmetry, hemiparesis, dysarthria, or consciousness changes.",
    symptoms: ["slurred speech", "face drooping", "numbness/tingling", "headache", "dizziness", "unconsciousness"],
    otherAssociatedSymptoms: ["blurred vision", "fainting"],
    nextSteps: "CRITICAL EMERGENCY: Call 112 immediately. Note the exact time symptoms began. Rapid non-contrast brain CT and immediate thrombolysis evaluation in a dedicated stroke unit are paramount.",
  },
  {
    id: "malaria-febrile-illness",
    name: "Malaria / Acute Febrile Illness",
    department: "General Medicine",
    urgency: "urgent",
    description: "Plasmodium parasitic infection transmitted by Anopheles mosquitoes, producing paroxysms of high fever with rigors, sweating, headache, severe myalgia, and nausea.",
    symptoms: ["fever", "headache", "body ache", "sweating", "fatigue", "nausea", "vomiting"],
    otherAssociatedSymptoms: ["loss of appetite", "dizziness"],
    nextSteps: "Consult an Internal Medicine doctor promptly. Rapid diagnostic malaria antigen test (RDT) and thick/thin blood smear microscopy are required.",
  },
  {
    id: "ophthalmic-infection-conjunctivitis",
    name: "Ocular Surface Inflammation / Conjunctivitis",
    department: "Ophthalmology",
    urgency: "routine",
    description: "Inflammatory or infectious disorder of the ocular surface or surrounding periorbital structures, presenting with ocular soreness, blurred vision, or headache.",
    symptoms: ["pain behind the eyes", "blurred vision", "headache"],
    otherAssociatedSymptoms: ["swelling", "dizziness"],
    nextSteps: "Consult an Ophthalmologist for slit-lamp biomicroscopy and visual acuity examination. Avoid rubbing the eyes.",
  },
];

/* ─────────────── matching engine ─────────────── */

export function matchConditions(patientSymptoms: string[]): MatchedCondition[] {
  if (!patientSymptoms || patientSymptoms.length === 0) return [];

  const positiveSet = new Set(patientSymptoms.map((s) => s.toLowerCase().trim()));
  const candidates: MatchedCondition[] = [];

  for (const cond of DISEASE_KNOWLEDGE_BASE) {
    const matched = cond.symptoms.filter((s) => positiveSet.has(s));
    if (matched.length === 0) continue;

    // Harmonic mean (F1 score) between patient input overlap and disease profile
    const precision = matched.length / patientSymptoms.length;
    const recall = matched.length / cond.symptoms.length;
    const f1 = (2 * precision * recall) / (precision + recall);

    // Bounded between 15% and 98% (never claiming 100% false certainty)
    const matchScore = Math.min(98, Math.max(15, Math.round(f1 * 100)));

    const otherSymptoms = cond.symptoms
      .filter((s) => !positiveSet.has(s))
      .concat(cond.otherAssociatedSymptoms || [])
      .filter((s) => !positiveSet.has(s))
      .slice(0, 4);

    candidates.push({
      id: cond.id,
      name: cond.name,
      department: cond.department,
      urgency: cond.urgency,
      description: cond.description,
      matchScore,
      matchedSymptoms: matched,
      otherSymptoms,
      nextSteps: cond.nextSteps,
    });
  }

  // Rank by matchScore descending, then by number of matched symptoms
  candidates.sort((a, b) => b.matchScore - a.matchScore || b.matchedSymptoms.length - a.matchedSymptoms.length);

  // If patient provided multiple symptoms, prioritize multi-symptom matches
  if (patientSymptoms.length >= 2) {
    const multiMatch = candidates.filter((c) => c.matchedSymptoms.length >= 2);
    if (multiMatch.length > 0) {
      return multiMatch.slice(0, 4);
    }
  }

  return candidates.slice(0, 3);
}

/* ─────────────── clause parsing & negation scoping ─────────────── */

interface ParsedClause {
  text: string;
}

function splitClauses(raw: string): ParsedClause[] {
  const sentences = raw.split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean);
  const clauses: ParsedClause[] = [];
  for (const sentence of sentences) {
    for (const part of sentence.split(CLAUSE_SPLIT)) {
      const t = part.trim().toLowerCase();
      if (!t || t.length < 2) continue;
      clauses.push({ text: t });
    }
  }
  return clauses;
}

function detectNegation(clause: string): boolean {
  return NEGATION_CUES.test(clause);
}

/* ─────────────── main symptom analysis ─────────────── */

export function analyzeSymptoms(input: string, explicitSymptoms?: string[]): MultiSymptomAnalysis {
  const raw = (input || "").trim();
  const clauses = splitClauses(raw);

  const symptoms: ExtractedSymptom[] = [];
  const negated: string[] = [];

  // 1. Extract from free-text clauses
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
      break;
    }
  }

  // 2. Also register any explicitly passed symptom chips
  if (Array.isArray(explicitSymptoms)) {
    for (const exp of explicitSymptoms) {
      const trimmed = exp.trim().toLowerCase();
      for (const [re, name] of SYMPTOM_CANON) {
        if (re.test(trimmed) || name.toLowerCase() === trimmed) {
          if (!symptoms.some((s) => s.name === name) && !negated.includes(name)) {
            symptoms.push({ name, text: exp, negated: false });
          }
          break;
        }
      }
    }
  }

  const positive = symptoms.filter((s) => !s.negated).map((s) => s.name);
  const positiveSet = new Set(positive);

  // Strongest duration & severity across all symptoms
  const allDurations = symptoms.map((s) => s.duration).filter(Boolean) as string[];
  const duration = allDurations[allDurations.length - 1];
  const severities = symptoms.map((s) => s.severity).filter(Boolean) as ExtractedSymptom["severity"][];
  const severity = severities.includes("severe") ? "severe" : severities.includes("moderate") ? "moderate" : severities[0];

  /* ── 1. Combination emergency triage rules ── */
  let comboReason: string | null = null;
  for (const rule of COMBO_RULES) {
    const hits = rule.symptoms.filter((s) => positiveSet.has(s)).length;
    if (hits >= rule.min) {
      comboReason = rule.reason;
      break;
    }
  }

  /* ── 2. Match potential medical conditions ── */
  const possibleConditions = matchConditions(positive);

  /* ── 3. Department routing & triage urgency ── */
  const routing = routeSymptoms(raw || positive.join(", ") || "checkup");
  const positiveText = positive.join(", ");
  const routingPositive = positiveText ? routeSymptoms(positiveText) : null;

  let urgency: MultiSymptomAnalysis["urgency"] = "routine";
  let urgencyReason = "No immediate emergency indicators found.";
  let suggestedDepartment = routing.department;

  // Determine top matching condition's recommendation if supported
  const topCondition = possibleConditions[0] ?? null;

  if (comboReason) {
    urgency = "emergency";
    urgencyReason = comboReason;
    suggestedDepartment = "Emergency Center";
  } else if (routing.urgency.isEmergency) {
    urgency = "emergency";
    urgencyReason = `Emergency indicator identified: ${routing.urgency.matchedTerms.join(", ")}.`;
    suggestedDepartment = "Emergency Center";
  } else if (topCondition && topCondition.urgency === "urgent" && (topCondition.matchScore >= 60 || positive.length >= 3)) {
    urgency = "urgent";
    urgencyReason = `Symptom constellation correlates with ${topCondition.name}; prompt clinical evaluation is advised.`;
    suggestedDepartment = topCondition.department;
  } else if (severity === "severe" && positive.length >= 3) {
    urgency = "urgent";
    urgencyReason = "Multiple symptoms reported with severe intensity — prompt clinical review is advised.";
    suggestedDepartment = topCondition?.department ?? routing.department;
  } else if (topCondition && topCondition.matchScore >= 50) {
    suggestedDepartment = topCondition.department;
  }

  // Filter alternatives from router and conditions
  const altSet = new Set<string>();
  if (routing.alternatives) {
    for (const a of routing.alternatives) {
      if (a.department !== suggestedDepartment && a.department !== "Emergency Center" && a.department !== "__EMERGENCY__") {
        altSet.add(a.department);
      }
    }
  }
  for (const cond of possibleConditions) {
    if (cond.department !== suggestedDepartment && cond.department !== "Emergency Center") {
      altSet.add(cond.department);
    }
  }
  const alternatives = Array.from(altSet).slice(0, 3);

  /* ── 3b. Pediatric rule ── */
  const CHILD_RE = /\b(child|children|kid|baby|infant|toddler|newborn|son|daughter|year old|years old|month old)\b/i;
  let childNote = false;
  if (urgency === "routine" && CHILD_RE.test(raw)) {
    childNote = true;
    if (suggestedDepartment !== "Pediatrics") {
      const pedIdx = alternatives.indexOf("Pediatrics");
      if (pedIdx >= 0) alternatives.splice(pedIdx, 1);
      alternatives.unshift(suggestedDepartment);
      suggestedDepartment = "Pediatrics";
    }
  }

  /* ── 4. Clinical explanation summary ── */
  const explanation =
    urgency === "emergency"
      ? `${urgencyReason} Seek emergency medical care immediately — call 112 or proceed to the nearest emergency room.`
      : childNote && suggestedDepartment === "Pediatrics"
        ? `A pediatric patient was described, so ${suggestedDepartment} is the appropriate department.`
        : topCondition && topCondition.matchScore >= 60
          ? `Symptom pattern closely matches ${topCondition.name} (${topCondition.matchScore}% correlation). Recommended specialty: ${suggestedDepartment}.`
          : `Based on the combined pattern of ${positive.length || 1} reported symptom(s), ${suggestedDepartment} is recommended for clinical evaluation.`;

  /* ── 5. Follow-up questions (emitted only when not an emergency) ── */
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
    negated,
    duration,
    severity,
    urgency,
    urgencyReason,
    suggestedDepartment,
    alternativeDepartments: alternatives,
    possibleConditions,
    followUpQuestions,
    explanation,
    version: ANALYSIS_VERSION,
  };
}

/** Plain-language medical disclaimer shown with every assessment. */
export const ANALYSIS_DISCLAIMER =
  "This preliminary assessment is AI-assisted decision support and does NOT constitute a confirmed medical diagnosis. Symptoms may stem from multiple underlying etiologies. A qualified clinician must conduct a physical examination and diagnostic testing to confirm treatment.";
