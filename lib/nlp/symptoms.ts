/**
 * CarePulse — NLP symptom → department router (inference side).
 *
 * Evaluates the TF-IDF + LogisticRegression pipeline trained by
 * `ml/train_symptom_router.py` (exported to `ml/symptom_router.json`).
 *
 * Layers, in order:
 *   1. urgency lexicon hard-routes to the Emergency Center.
 *   2. score each department with the trained TF-IDF + LogisticRegression
 *      model (identical math to sklearn at training time).
 *   3. anchor terms add a small bonus per department (hybrid rule+ML).
 *
 * Anchors are matched as substrings of the (lowercased) text, then filtered:
 *   - a hit that starts mid-word is cancelled (the "ear" inside "heart" or
 *     "year" must never boost ENT, the "stab" inside "established" must
 *     never look like trauma);
 *   - a hit fully inside a NEVER_ANCHOR word is cancelled ("kid" inside
 *     "kidney" is renal, not pediatric; "corn" inside "corner" is geometric).
 * The Python trainer mirrors this logic exactly when evaluating GOLD.
 */
import "server-only"; // never leak into the client bundle
import fs from "node:fs";
import path from "node:path";

export interface SymptomRouting {
  department: string;
  confidence: number; // 0..1
  alternatives: { department: string; confidence: number }[];
  urgency: {
    isEmergency: boolean;
    matchedTerms: string[];
    note: string;
  };
  matchedAnchors: string[];
  disclaimer: string;
}

interface FeatureBlock {
  analyzer: "word" | "char_wb";
  ngram_range: [number, number];
  sublinear_tf: boolean;
  lowercase: boolean;
  vocabulary: Record<string, number>;
  idf: number[];
  coef: number[][]; // [class][feature within block]
}

interface RouterDoc {
  feature_blocks: FeatureBlock[];
  classifier: { classes: string[]; intercept: number[] };
  anchor_terms: Record<string, string[]>;
  urgency_terms: string[];
  departments: string[];
  metrics: {
    cv_accuracy: number;
    heldout_accuracy: number;
    gold_accuracy: number;
    heldout_n: number;
    gold_n: number;
    feature_kind: string;
    n_samples: number;
    n_clean: number;
    n_features: number;
  };
}

/**
 * Words that contain a shorter clinical anchor purely by accident. Any
 * anchor hit lying fully inside one of these substrings is cancelled.
 * (Words where the nested anchor starts mid-word are already handled by
 * the mid-word rule; this list covers the "kid"-in-"kidney" case where
 * the nested anchor starts at the word boundary.)
 */
const NEVER_ANCHOR = ["hear", "heart", "rear", "near", "year", "yearly", "early", "earth", "kidney", "kidneys", "kidnap", "establish", "corner", "corners", "scorn"];

let cached: RouterDoc | null = null;

function loadModel(): RouterDoc {
  if (cached) return cached;
  const p = path.join(process.cwd(), "ml", "symptom_router.json");
  cached = JSON.parse(fs.readFileSync(p, "utf8")) as RouterDoc;
  return cached;
}

function ngrams(text: string, analyzer: "word" | "char_wb", lo: number, hi: number): string[] {
  if (analyzer === "word") {
    const words = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    for (let n = lo; n <= hi; n++) {
      for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
    }
    return out;
  }
  // char_wb: pad each word with spaces, emit char n-grams per word
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const padded = ` ${w} `;
    for (let n = lo; n <= hi; n++) {
      for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
    }
  }
  return out;
}

function tf(sublinear: boolean, count: number): number {
  return sublinear ? 1 + Math.log(count) : count;
}

interface AnchorHit {
  dept: string;
  term: string;
  start: number;
  end: number;
}

/**
 * Collect anchor hits and apply the NEVER_ANCHOR + mid-word filters.
 * The bonus is ANCHOR_BONUS (default 1.5) per (dept, term) hit, mirroring
 * the training-time evaluator in ml/train_symptom_router.py.
 */
function collectAnchorHits(text: string): { bonus: Record<string, number>; matched: string[] } {
  const model = loadModel();
  const hits: AnchorHit[] = [];
  for (const [dept, terms] of Object.entries(model.anchor_terms)) {
    for (const term of terms) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(term, from);
        if (i < 0) break;
        from = i + term.length;
        hits.push({ dept, term, start: i, end: i + term.length });
      }
    }
  }

  // never-anchor word occurrences (independent of term membership)
  const neverSpans: { start: number; end: number }[] = [];
  for (const term of NEVER_ANCHOR) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i < 0) break;
      from = i + term.length;
      neverSpans.push({ start: i, end: i + term.length });
    }
  }

  const kept = hits.filter((h) => {
    const prev = h.start > 0 ? text[h.start - 1] : " ";
    if (/[a-z]/.test(prev)) return false; // anchor starts mid-word → accidental
    if (neverSpans.some((ns) => ns.start <= h.start && h.end <= ns.end)) return false;
    return true;
  });

  const bonus: Record<string, number> = {};
  const matched: string[] = [];
  for (const h of kept) {
    bonus[h.dept] = (bonus[h.dept] ?? 0) + 1.5;
    matched.push(h.term.trim());
  }
  return { bonus, matched };
}

function urgencyCheck(model: RouterDoc, text: string) {
  const matched = model.urgency_terms.filter((t) => text.includes(t));
  return {
    isEmergency: matched.length > 0,
    matchedTerms: matched,
    note: matched.length
      ? "These symptoms can indicate an emergency. Go to the Emergency Center or call your local emergency number now."
      : "No emergency flags detected. This tool does not replace medical assessment.",
  };
}

/** Route free-text symptoms to the most likely CarePulse department. */
export function routeSymptoms(input: string): SymptomRouting {
  const model = loadModel();
  const text = input.toLowerCase().trim();

  const blank: SymptomRouting = {
    department: "General Medicine",
    confidence: 0,
    alternatives: [],
    urgency: urgencyCheck(model, ""),
    matchedAnchors: [],
    disclaimer: "Decision-support demo — not a diagnosis.",
  };
  if (!text) return blank;

  // 1. scores across all feature blocks + intercept
  const classes = model.classifier.classes;
  const scores = new Array(classes.length).fill(0);
  for (let c = 0; c < classes.length; c++) scores[c] += model.classifier.intercept[c];

  for (const block of model.feature_blocks) {
    const grams = ngrams(text, block.analyzer, block.ngram_range[0], block.ngram_range[1]);
    const counts = new Map<string, number>();
    for (const g of grams) counts.set(g, (counts.get(g) ?? 0) + 1);
    for (const [g, count] of Array.from(counts.entries())) {
      const idx = block.vocabulary[g];
      if (idx === undefined) continue;
      const w = tf(block.sublinear_tf, count) * block.idf[idx];
      for (let c = 0; c < classes.length; c++) {
        scores[c] += w * block.coef[c][idx];
      }
    }
  }

  // 2. anchor bonuses — each collected hit is already worth 1.5 exactly like
  // the training-time evaluator, so no extra scaling here.
  const { bonus, matched } = collectAnchorHits(text);
  for (const [dept, b] of Object.entries(bonus)) {
    const ci = classes.indexOf(dept);
    if (ci >= 0) scores[ci] += b;
  }

  // 3. softmax with an adaptive temperature so the display stays informative:
  // the lowest-scoring class maps to ≈1%, keeping mid-ranked departments visible
  const maxS = Math.max(...scores);
  const minS = Math.min(...scores);
  const temp = Math.max(0.5, (maxS - minS) / Math.log(100));
  const exps = scores.map((s) => Math.exp((s - maxS) / temp));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  const emergencyIdx = classes.indexOf("__EMERGENCY__");
  const rankedRaw = classes
    .map((dept, i) => ({
      department: dept === "__EMERGENCY__" ? "Emergency Center" : dept,
      confidence: probs[i],
    }))
    .sort((a, b) => b.confidence - a.confidence);

  // Urgency check only certifies trivially life-threatening phrases — the model
  // itself also has an __EMERGENCY__ class, and its top-1 should be honored.
  const urgency = urgencyCheck(model, text);
  const modelSaysEmergency = emergencyIdx >= 0
    ? rankedRaw[0].department === "Emergency Center"
    : false;
  const showEmergency = urgency.isEmergency || modelSaysEmergency;

  return {
    department: showEmergency ? "Emergency Center" : rankedRaw[0].department,
    confidence: Math.round(rankedRaw[0].confidence * 100) / 100,
    alternatives: rankedRaw.slice(1, 4),
    urgency: showEmergency
      ? urgency
      : { ...urgency, note: "No emergency flags detected. This tool does not replace medical assessment." },
    matchedAnchors: matched,
    disclaimer:
      "AI-assisted routing is decision support only — not a diagnosis. A clinician confirms the final department.",
  };
}

/** True when the text matches emergency urgency terms (used by intake forms). */
export function isLikelyEmergency(text: string): boolean {
  return urgencyCheck(loadModel(), text.toLowerCase()).isEmergency;
}
