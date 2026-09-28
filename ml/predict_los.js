#!/usr/bin/env node
/**
 * Standalone LOS prediction CLI — loads ml/los_model.json directly.
 *
 *   node ml/predict_los.js --age 65 --priority CRITICAL --icu --comorbidities 3
 *   node ml/predict_los.js --age 30 --priority LOW --gender female
 *
 * The web app uses lib/ml/los.ts (same JSON, same features); this CLI is for
 * demos, scripts, and evaluation without running the server.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(fs.readFileSync(path.join(here, "los_model.json"), "utf8"));

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const flag = (name) => args.includes(`--${name}`);

const features = {
  age: Number(arg("age", 45)),
  gender: arg("gender", "other"),
  priority: arg("priority", "MODERATE").toUpperCase(),
  emergency: flag("emergency"),
  comorbidityCount: Number(arg("comorbidities", 0)),
  admissionIcu: flag("icu"),
  wardType: arg("ward", "semi-private"),
  nightAdmission: flag("night"),
  weekendAdmission: flag("weekend"),
};

function predictTree(tree, x) {
  let i = 0;
  while (tree.children_left[i] !== -1) {
    i = x[tree.feature[i]] <= tree.threshold[i] ? tree.children_left[i] : tree.children_right[i];
  }
  return tree.value[i];
}

const x = [
  features.age,
  features.gender === "male" ? 1 : 0,
  features.priority === "CRITICAL" ? 1 : 0,
  features.priority === "URGENT" ? 1 : 0,
  features.priority === "MODERATE" ? 1 : 0,
  features.emergency ? 1 : 0,
  features.comorbidityCount,
  features.admissionIcu ? 1 : 0,
  features.wardType === "private" ? 1 : 0,
  features.wardType === "semi-private" ? 1 : 0,
  features.nightAdmission ? 1 : 0,
  features.weekendAdmission ? 1 : 0,
];

let sum = 0;
for (const t of model.trees) sum += predictTree(t, x);
const losDays = Math.max(0.5, Math.round(sum * model.scale * 10) / 10);

const admit = new Date();
admit.setDate(admit.getDate() + Math.ceil(losDays));

console.log(JSON.stringify({
  input: features,
  predictedLosDays: losDays,
  expectedDischargeDate: admit.toISOString().slice(0, 10),
  model: model.selected,
  metrics: model.metrics,
}, null, 2));
