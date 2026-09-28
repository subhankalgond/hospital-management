/**
 * CarePulse — Length-of-Stay (LOS) prediction (server entry).
 *
 * Loads the forest exported by `ml/train_los.py` and delegates evaluation to
 * the environment-agnostic core in `los-core.ts` (shared with client code via
 * the API). Pure TypeScript at inference — no Python needed on Vercel.
 */

import fs from "node:fs";
import path from "node:path";
import { featureVector, predictWithDoc, type LosFeatures, type LosPrediction, type ForestDoc } from "./los-core";

export type { LosFeatures, LosPrediction };

let cached: ForestDoc | null = null;

export function loadLosModel(): ForestDoc {
  if (cached) return cached;
  // model file lives at <project>/ml/los_model.json in dev and is traced into
  // the bundle by outputFileTracingIncludes in production
  const p = path.join(process.cwd(), "ml", "los_model.json");
  cached = JSON.parse(fs.readFileSync(p, "utf8")) as ForestDoc;
  return cached;
}

/** Predict length of stay (days) for one admission profile. */
export function predictLos(features: LosFeatures): LosPrediction {
  return predictWithDoc(loadLosModel(), features);
}

/** Batch predict (used by the beds page for occupancy forecasting). */
export function predictLosBatch(features: LosFeatures[]): LosPrediction[] {
  const doc = loadLosModel();
  return features.map((f) => predictWithDoc(doc, f));
}

export { featureVector };
