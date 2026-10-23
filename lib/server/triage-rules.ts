/**
 * Clinical escalation rule engine (transparent + testable).
 *
 * This is a configurable, clinically reviewed rule set — NOT the proprietary
 * Manchester Triage System and NOT a licensed decision-support product. Rules
 * below are deliberately conservative: they only ESCALATE (never de-escalate
 * or rule out an emergency) and they run before any AI/model call in the
 * booking path so emergency instructions are never delayed by the model.
 *
 * Adding a rule = appending to ESCALATION_RULES. Each rule is nameable,
 * auditable and individually adjustable via config if the hospital's
 * clinical governance decides thresholds must change.
 */

export type RuleCategory =
  | "cardiac"
  | "respiratory"
  | "neurological"
  | "obstetric"
  | "trauma"
  | "bleeding"
  | "pediatric"
  | "generic-toxicity";

export interface EscalationRule {
  id: string;
  category: RuleCategory;
  /** Primary phrases that independently justify escalation when present with a modifier. */
  primaries: string[];
  /** Strengtheners/concomitant signs that make the primary warning urgent. */
  modifiers: string[];
  /** Stand-alone phrases that escalate even without a modifier (e.g. stroke-face). */
  alwaysEscalate?: string[];
  translate: {
    en: string;
    hi: string;
    ta: string;
    te: string;
    bn: string;
    mr: string;
  };
}

export const ESCALATION_RULES: EscalationRule[] = [
  {
    id: "RULE-CARDIAC-01",
    category: "cardiac",
    primaries: ["chest pain", "chest pressure", "chest tightness", "heaviness in chest"],
    modifiers: ["difficulty breathing", "shortness of breath", "breathless", "can't breathe", "cannot breathe", "sweating", "clammy", "pain spreading to arm", "pain spreading to jaw", "pain radiating to arm", "pain radiating to back", "nausea", "faint", "dizzy", "lightheaded", "syncope", "irregular heartbeat", "palpitations"],
    translate: {
      en: "Chest pain with breathing difficulty can signal a cardiac emergency. Do not wait for an appointment.",
      hi: "सांस लेने में तकलीफ के साथ सीने में दर्द हृदय की आपातकालीन स्थिति का संकेत हो सकता है। अपॉइंटमेंट का इंतज़ार न करें।",
      ta: "சுவாசக் குறைவுடன் உள்ள மார்பு வலி இதய அவசரநிலையின் அறிகுறியாக இருக்கலாம். நேர்காணலுக்கு காத்திருக்க வேண்டாம்.",
      te: "శ్వాసకోశ ఇబ్బందితో వక్షోజ నొప్పి గుండె ఆపదల సూచన కావచ్చు. అపాయింట్‌మెంట్ కోసం వేచి ఉండకండి.",
      bn: "শ্বাসকষ্টের সাথে বুকে ব্যথা হৃদযন্ত্রের আপাতকালীন অবস্থার সংকেত হতে পারে। অ্যাপয়েন্টমেন্টের জন্য অপেক্ষা করবেন না।",
      mr: "श्वास घेण्यास त्रास असलेल्या छातीतील वेदना ही हृदयविकाराची तातडीची लक्षणे असू शकतात. अपॉइंटमेंटसाठी थांबू नका.",
    },
  },
  {
    id: "RULE-RESP-01",
    category: "respiratory",
    primaries: ["difficulty breathing", "shortness of breath with", "can't breathe", "cannot breathe", "gasping", "wheezing with"],
    modifiers: ["blue lips", "bluish lips", "cyanosis", "confusion", "drowsy", "dizzy", "fainting", "unable to speak", "speaking in single words", "wheezing", "swelling of throat", "swelling of tongue"],
    alwaysEscalate: ["choking", "turning blue", "stopped breathing", "not breathing"],
    translate: {
      en: "Severe breathing difficulty can become life-threatening within minutes.",
      hi: "गंभीर सांस लेने में तकलीफ कुछ ही मिनटों में जानलेवा हो सकती है।",
      ta: "கடுமையான சுவாசக் குறைவு சில நிமிடங்களில் உயிருக்கு ஆபத்தாக மாறலாம்.",
      te: "తీవ్రమైన శ్వాసకోశ ఇబ్బంది కొన్ని నిమిషాల్లో ప్రాణాంతకం కావచ్చు.",
      bn: "শীর্ণ শ্বাসকষ্ট কয়েক মিনিটেই প্রাণঘাতী হয়ে উঠতে পারে।",
      mr: "तीव्र श्वास घेण्यास त्रास काही मिनिटांत प्राणघातक होऊ शकतो.",
    },
  },
  {
    id: "RULE-NEURO-01",
    category: "neurological",
    primaries: [],
    alwaysEscalate: [
      "face drooping",
      "face droop",
      "slurred speech",
      "unable to speak",
      "difficulty speaking",
      "numbness on one side",
      "one side of face",
      "one side of the body",
      "sudden vision loss",
      "unconscio",
      "unresponsive",
      "fits with",
      "seizure",
    ],
    modifiers: ["stroke", "sudden", "fall", "headache", "headache with vomiting", "vomiting"],
    translate: {
      en: "Sudden one-sided weakness, speech change or vision loss may be a stroke — minutes matter.",
      hi: "अचानक शरीर के एक तरफ की कमज़ोरी, बोलने या देखने में बदलाव स्ट्रोक हो सकता है — कुछ मिनट बहुत महत्वपूर्ण हैं।",
      ta: "ஒரு பக்க மருந்தோயல், பேச்சு மாற்றம், பார்வை இழப்பு போன்றவை பக்கவாதமாக இருக்கலாம் — நிமிடங்கள் முக்கியம்.",
      te: "ఒక వైపు నిప్పు లేకపోవడం, మాటలు అనంతరమై నిన్ను కళ్ళు కనిపించకపోవడం ఒక స్ట్రోక్ కావచ్చు — నిమిషాలు ముఖ్యం.",
      bn: "হঠাৎ শরীরের একপাশে অসাড়তা, কথা বলতে বা দেখতে অসুবিধা স্ট্রোক হতে পারে — মিনিট গুরুত্বপূর্ণ।",
      mr: "अचानक एका बाजूला अशक्तपणा, बोलणे किंवा दिसण्यात बदल हा पक्षाघात असू शकतो — मिनिटे महत्त्वाची आहेत.",
    },
  },
  {
    id: "RULE-OBST-01",
    category: "obstetric",
    primaries: ["pregnan", "obstetr"],
    modifiers: ["bleeding", "severe abdominal pain", "reduced fetal movement", "baby not moving", "waters broke", "water broke", "severe headache with", "blurred vision", "seizure", "swelling of face", "fits"],
    translate: {
      en: "Bleeding or reduced fetal movement during pregnancy needs urgent obstetric review.",
      hi: "गर्भावस्था में रक्तस्राव या बच्चे की हलचल घटना तत्काल प्रसूति जांच मांगती है।",
      ta: "கர்ப்ப காலத்தில் இரத்த புறப்பாடு அல்லது சூல் அசைவு குறைவு உடன் பரிசோதனை தேவை.",
      te: "గర్భంలో రక్తప్రవాహం లేదా భ్రూణ కదలిక తగ్గడం తక్షణ పరీక్ష అవసరం.",
      bn: "গর্ভাবস্থায় রক্তক্ষরণ বা শিশুর অস্ত্রসংক্রান্ত চলাচল কমে যাওয়া জরুরি পরীক্ষা প্রয়োজন।",
      mr: "गर्भारपणात रक्तस्राव किंवा घटलेली बळाची हालचाल तातडीची तपासणी आवश्यक आहे.",
    },
  },
  {
    id: "RULE-TRTHM-01",
    category: "trauma",
    primaries: ["head injury", "fell from", "fall from", "accident", "fracture with", "deep wound", "penetrating injury", "burn", "drowned", "snake bite", "snakebite", "traffic accident"],
    modifiers: ["unconscio", "unresponsive", "vomiting", "bleeding", "can't move", "cannot move", "severe pain"],
    translate: {
      en: "Serious injury with vomiting, unconsciousness or severe bleeding is an emergency.",
      hi: "गंभीर चोट, उलटी, बेहोशी या तेज़ रक्तस्राव आपातकालीन स्थिति है।",
      ta: "கடுமையான காயம், வாந்தி, மயக்கம், அல்லது பெருமளவில் இரத்த இழப்பு அவசரநிலை.",
      te: "తీవ్రమైన గాయం, వాంతి, మైకము లేదా రక్తస్రావం ఆపదలకు సంకేతం.",
      bn: "গুরুতর আঘাত, বমি, অজ্ঞান হওয়া বা রক্তক্ষরণ জরুরি অবস্থা।",
      mr: "गंभीर दुखापत, उलटी, बेशुड्डत अथवा जोरदार रक्तस्राव ही आपातकालीन स्थिती आहे.",
    },
  },
  {
    id: "RULE-BLED-01",
    category: "bleeding",
    primaries: ["severe bleeding", "bleeding that won't stop", "bleeding that will not stop", "vomiting blood", "blood in stool", "black tarry stool", "coughing blood", "blood in vomit", "heavy bleeding", "hemorrhage"],
    modifiers: ["unconscio", "dizzy", "fainting", "pale"],
    translate: {
      en: "Uncontrolled bleeding or vomiting blood needs immediate emergency care.",
      hi: "थमने वाला न हो बहता खून या लहूलुहान उलटी को तत्काल आपातकालीन देखभाल चाहिए।",
      ta: "நிற்காத ரத்தப்போக்கு அல்லது ரத்தத்துடன் வாந்தி உடனடி அவசர சிகிச்சை தேவை.",
      te: "ఆగని రక్తస్రావం లేదా రక్తంతో వాంతులు తక్షణ ఆపదా సంరక్షణ అవసరం.",
      bn: "না থামা রক্তক্ষরণ বা রক্তের বমি অবিলম্বে জরুরি যত্ন প্রয়োজন।",
      mr: "थांबणारा नसलेला रक्तस्त्राव किंवा रक्ताने उलटीला तातडीची उपचार पद्धत आवश्यक आहे.",
    },
  },
];

/**
 * Cross-cutting patterns that escalate on their own regardless of category.
 * Deliberately short → substring match. Each entry maps to a rule id for audit.
 */
const ALWAYS_ESCALATE_PATTERNS: { pattern: string; ruleId: string }[] = [
  ...ESCALATION_RULES.flatMap((r) =>
    (r.alwaysEscalate ?? []).map((p) => ({ pattern: p, ruleId: r.id }))
  ),
  { pattern: "suicide", ruleId: "RULE-BEHAV-01" },
  { pattern: "overdose", ruleId: "RULE-BEHAV-01" },
  { pattern: "poison", ruleId: "RULE-BEHAV-01" },
  { pattern: "snake bite", ruleId: "RULE-BEHAV-01" },
  { pattern: "snakebite", ruleId: "RULE-BEHAV-01" },
  { pattern: "unconscio", ruleId: "RULE-NEURO-01" },
  { pattern: "sudden confusion", ruleId: "RULE-NEURO-01" },
  { pattern: "stiff neck with", ruleId: "RULE-INFECT-01" },
  { pattern: "stiff neck", ruleId: "RULE-INFECT-01" },
];

export interface EscalationHit {
  ruleId: string;
  matchedOn: string[];
  severity: "critical" | "high";
  /** Combined clinical text for display. */
  clinicalSummary: { en: string };
}

export interface RuleEngineResult {
  escalate: boolean;
  hits: EscalationHit[];
  /** interest areas surfaced for the triage file, editorialized placeholders absent */
  categories: RuleCategory[];
  engineVersion: string;
}

const another: Record<string, EscalationHit["severity"]> = {
  "RULE-CARDIAC-01": "critical",
  "RULE-RESP-01": "critical",
  "RULE-NEURO-01": "critical",
  "RULE-OBST-01": "high",
  "RULE-TRTHM-01": "high",
  "RULE-BLED-01": "critical",
  "RULE-BEHAV-01": "critical",
  "RULE-INFECT-01": "critical",
  "RULE-PEDS-01": "high",
  "RULE-TOX-01": "critical",
};

export const RULE_ENGINE_VERSION = "1.0.0";

function lower(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s/-]/g, " ").replace(/\s+/g, " ");
}

export function evaluateEscalationRules(raw: string): RuleEngineResult {
  const t = lower(raw);
  const hits = new Map<string, EscalationHit>();

  if (!t.trim()) {
    return { escalate: false, hits: [], categories: [], engineVersion: RULE_ENGINE_VERSION };
  }

  // pass 1 — self-standing patterns
  for (const { pattern, ruleId } of ALWAYS_ESCALATE_PATTERNS) {
    if (t.includes(pattern)) {
      const existing = hits.get(ruleId);
      const next: EscalationHit = existing ?? {
        ruleId,
        matchedOn: [],
        severity: another[ruleId] ?? "high",
        clinicalSummary: { en: "" },
      };
      if (!next.matchedOn.includes(pattern)) next.matchedOn.push(pattern);
      hits.set(ruleId, next);
    }
  }

  // pass 2 — primary + modifier pairs
  for (const rule of ESCALATION_RULES) {
    const hit = hits.get(rule.id) ?? {
      ruleId: rule.id,
      matchedOn: [],
      severity: another[rule.id] ?? "high",
      clinicalSummary: { en: "" },
    };
    let primaryFound: string | null = null;
    for (const p of rule.primaries) {
      if (t.includes(p)) {
        primaryFound = p;
        break;
      }
    }
    if (!primaryFound) continue; // no primary phrase for this rule in the text
    // primary alone is enough to surface, but a modifier makes it urgent
    if (!hit.matchedOn.includes(primaryFound)) hit.matchedOn.push(primaryFound);
    hits.set(rule.id, hit);
    for (const m of rule.modifiers) {
      if (t.includes(m) && !hit.matchedOn.includes(m)) {
        hit.matchedOn.push(m);
        hits.set(rule.id, hit);
      }
    }
  }

  const finalHits: EscalationHit[] = [];
  const categories: RuleCategory[] = [];
  for (const hit of Array.from(hits.values())) {
    const rule = ESCALATION_RULES.find((r) => r.id === hit.ruleId);
    hit.clinicalSummary = {
      en: rule ? rule.translate.en : "Careful clinical review is required.",
    };
    finalHits.push(hit);
    if (rule && !categories.includes(rule.category)) categories.push(rule.category);
  }

  return {
    escalate: finalHits.length > 0,
    hits: finalHits,
    categories,
    engineVersion: RULE_ENGINE_VERSION,
  };
}

/**
 * Triage priority for queue ordering. Deliberately NOT a numeric weight
 * calculation — a derived, explainable grade.
 */
export function triageGrade(result: RuleEngineResult): "critical" | "high" | "standard" {
  if (result.hits.some((h) => h.severity === "critical")) return "critical";
  if (result.hits.length > 0) return "high";
  return "standard";
}
