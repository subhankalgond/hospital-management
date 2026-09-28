/**
 * CarePulse — NLP symptom → department router (inference side).
 *
 * Evaluates the TF-IDF + LogisticRegression pipeline trained by
 * `ml/train_symptom_router.py` (exported to `ml/symptom_router.json`).
 * The exported format stores per-block vocabularies, IDF and coefficient
 * slices so a hand-rolled vectorizer reproduces sklearn's output exactly.
 *
 * Layers:
 *   1. urgency lexicon → flags likely emergencies (steers to Emergency Center)
 *   2. anchor terms    → rule layer adding clinical-keyword bonuses
 *   3. TF-IDF + linear model → the trained classifier
 *
 * Final scores are softmax-normalized for display. Returns top departments
 * with confidence and an urgency flag; UI and APIs consume this to preselect
 * the right department / doctor and warn on urgent presentations.
 */

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
    heldout_n: number;
    feature_kind: string;
    n_samples: number;
    n_clean: number;
    n_features: number;
  };
}

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

/** Symbolic anchors: fast, transparent boosts for clinical keywords. */
function anchorScores(text: string): { bonus: Record<string, number>; matched: string[] } {
  const model = loadModel();
  const bonus: Record<string, number> = {};
  const matched: string[] = [];
  for (const [dept, terms] of Object.entries(model.anchor_terms)) {
    for (const term of terms) {
      if (text.includes(term)) {
        bonus[dept] = (bonus[dept] ?? 0) + 1.5;
        matched.push(term.trim());
      }
    }
  }
  return { bonus, matched };
}

function urgencyCheck(text: string) {
  const model = loadModel();
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

  if (!text) {
    return {
      department: "General Medicine",
      confidence: 0,
      alternatives: [],
      urgency: urgencyCheck(""),
      matchedAnchors: [],
      disclaimer: "Decision-support demo — not a diagnosis.",
    };
  }

  // Build raw scores across all feature blocks + intercept + anchors
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

  const { bonus, matched } = anchorScores(text);
  for (const [dept, b] of Object.entries(bonus)) {
    const ci = classes.indexOf(dept);
    if (ci >= 0) scores[ci] += b;
  }

  // softmax with an adaptive temperature so the display stays informative:
  // the lowest-scoring class maps to ≈1%, keeping mid-ranked departments visible
  const maxS = Math.max(...scores);
  const minS = Math.min(...scores);
  const temp = Math.max(0.5, (maxS - minS) / Math.log(100));
  const exps = scores.map((s) => Math.exp((s - maxS) / temp));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  const ranked = classes
    .map((dept, i) => ({ department: dept === "__EMERGENCY__" ? "Emergency Center" : dept, confidence: probs[i] }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked[0];
  const urgency = urgencyCheck(text);

  return {
    department: urgency.isEmergency ? "Emergency Center" : top.department === "Emergency Center" ? "General Medicine" : top.department,
    confidence: Math.round(top.confidence * 100) / 100,
    alternatives: ranked.slice(1, 4),
    urgency,
    matchedAnchors: matched,
    disclaimer: "AI-assisted routing is decision support only — not a diagnosis. A clinician confirms the final department.",
  };
}

/** True when the text matches emergency urgency terms (used by intake forms). */
export function isLikelyEmergency(text: string): boolean {
  return urgencyCheck(text.toLowerCase()).isEmergency;
}
