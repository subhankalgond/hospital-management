import { analyzeSymptoms } from "../lib/nlp/multi";

const cases = [
  "I have chest discomfort, shortness of breath, dizziness, sweating, fatigue, nausea, and pain in my left arm since this morning.",
  "I have a skin rash and itching but no fever.",
  "My knee joint pain is worsening for two weeks with mild swelling.",
  "my 4 year old has fever and loose motions",
  "severe headache on the right side with nausea",
  "I do not have a fever but my ear has been ringing badly for three days",
];

for (const c of cases) {
  const a = analyzeSymptoms(c);
  console.log("=== TEXT:", c.slice(0, 70));
  console.log("pos:", a.symptoms.filter((s) => !s.negated).map((s) => s.name).join(" | "));
  console.log("neg:", a.negated.join(", ") || "(none)");
  console.log("urgency:", a.urgency, "| dept:", a.suggestedDepartment, "| alts:", a.alternativeDepartments.join(","));
  console.log("fu:", a.followUpQuestions.map((q) => q.id).join(",") || "(none)");
  console.log("why:", a.explanation.slice(0, 110));
}
