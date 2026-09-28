/**
 * CarePulse — LOS model core (environment-agnostic).
 *
 * Walks the exported sklearn tree ensemble in pure TypeScript. Imported by
 * both the server loader (lib/ml/los.ts) and client components that already
 * have the model JSON fetched — no node:fs here so it bundles for the browser.
 */

export interface LosFeatures {
  age: number;
  gender: "male" | "female" | "other";
  priority: "CRITICAL" | "URGENT" | "MODERATE" | "LOW";
  emergency: boolean;
  comorbidityCount: number;
  admissionIcu: boolean;
  wardType: "private" | "semi-private" | "icu";
  nightAdmission: boolean;
  weekendAdmission: boolean;
}

export interface LosPrediction {
  /** predicted length of stay in days (rounded to 0.1) */
  losDays: number;
  /** expected discharge date (admission + LOS), ISO yyyy-mm-dd */
  expectedDischargeDate: string;
  /** model metadata for transparency */
  model: string;
  metrics: { mae: number; r2: number };
  disclaimer: string;
}

export interface SklearnNode {
  feature: number[];
  threshold: number[];
  children_left: number[];
  children_right: number[];
  value: number[];
}

export interface ForestDoc {
  model: "randomforest" | "gbdt";
  features: string[];
  n_trees: number;
  scale: number;
  selected: string;
  candidates: Record<string, { mae: number; r2: number }>;
  metrics: { mae: number; r2: number };
  trees: SklearnNode[];
}

export function featureVector(f: LosFeatures): number[] {
  return [
    f.age,
    f.gender === "male" ? 1 : 0,
    f.priority === "CRITICAL" ? 1 : 0,
    f.priority === "URGENT" ? 1 : 0,
    f.priority === "MODERATE" ? 1 : 0,
    f.emergency ? 1 : 0,
    f.comorbidityCount,
    f.admissionIcu ? 1 : 0,
    f.wardType === "private" ? 1 : 0,
    f.wardType === "semi-private" ? 1 : 0,
    f.nightAdmission ? 1 : 0,
    f.weekendAdmission ? 1 : 0,
  ];
}

function predictTree(tree: SklearnNode, x: number[]): number {
  let i = 0;
  while (tree.children_left[i] !== -1) {
    const goLeft = x[tree.feature[i]] <= tree.threshold[i];
    i = goLeft ? tree.children_left[i] : tree.children_right[i];
  }
  return tree.value[i];
}

/** Evaluate a loaded model doc for one admission profile. */
export function predictWithDoc(model: ForestDoc, features: LosFeatures): LosPrediction {
  const x = featureVector(features);
  let sum = 0;
  for (const tree of model.trees) sum += predictTree(tree, x);
  const raw = sum * model.scale;
  const losDays = Math.max(0.5, Math.round(raw * 10) / 10);

  const admit = new Date();
  admit.setDate(admit.getDate() + Math.ceil(losDays));
  const expectedDischargeDate = admit.toISOString().slice(0, 10);

  return {
    losDays,
    expectedDischargeDate,
    model: model.selected,
    metrics: model.metrics,
    disclaimer:
      "Predicted length of stay is a statistical estimate from a demo model — not medical advice.",
  };
}
