/**
 * Patient risk-alert layer for the Doctor Panel.
 *
 * Pure function over data the store already holds — no diagnosis is made and
 * nothing is invented: an alert only cites recorded facts (allergies, active
 * orders, prior reactions, triage flags, vital-value ranges) and ALWAYS says
 * which rule produced it. Missing data is surfaced as missing, never as
 * "value normal".
 *
 * Rendering is additive: UI adds these banners to the consultation surface;
 * the function stays testable and auditable.
 */
import type { Patient, MedicationOrder, EmergencyCase, Visit, SymptomAssessmentRow, QueueEntry } from "./types";

export interface RiskAlert {
  id: string; // stable id — UI de-duplicates on it
  severity: "critical" | "warning" | "info";
  title: string;
  reason: string; // what recorded fact triggered it
  rule: string; // machine-readable rule id
}

export interface RiskAlertInput {
  patient?: Patient | null;
  activeOrders: MedicationOrder[];
  emergencies: EmergencyCase[];
  visits: Visit[];
  assessments: SymptomAssessmentRow[];
  queueEntries?: QueueEntry[];
}

export function computeRiskAlerts(input: RiskAlertInput): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const p = input.patient;
  if (!p) return alerts;

  const push = (a: RiskAlert) => {
    if (!alerts.some((x) => x.id === a.id)) alerts.push(a);
  };

  // RA-01 recorded allergy × active order
  const active = input.activeOrders.filter((o) => o.patientId === p.id && ["pending_review", "verified", "dispensing"].includes(o.status));
  for (const o of active) {
    for (const allergy of p.allergies ?? []) {
      const d = o.drug.toLowerCase();
      const al = allergy.toLowerCase();
      if (d && al && (d.includes(al) || al.includes(d))) {
        push({
          id: `ra01:${p.id}:${o.id}:${allergy}`,
          severity: "critical",
          title: `Allergy conflict — ${o.drug}`,
          reason: `Recorded allergy "${allergy}" collides with active medication order ${o.id}.`,
          rule: "RA-01 allergy-order",
        });
      }
    }
  }

  // RA-02 duplicate therapy across active orders
  const seen = new Map<string, MedicationOrder>();
  for (const o of active) {
    const key = o.drug.trim().toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      push({
        id: `ra02:${p.id}:${key}`,
        severity: "warning",
        title: `Duplicate therapy — ${o.drug}`,
        reason: `Orders ${prev.id} and ${o.id} are both active for this medication.`,
        rule: "RA-02 duplicate-therapy",
      });
    }
    seen.set(key, o);
  }

  // RA-03 prior emergency / triage flags
  const em = input.emergencies.find((e) => e.patientId === p.id && e.priority === "CRITICAL");
  if (em) {
    push({
      id: `ra03:${p.id}:${em.id}`,
      severity: "critical",
      title: "Critical emergency history",
      reason: `Emergency case ${em.id} was triaged CRITICAL (${em.symptoms.slice(0, 120)}).`,
      rule: "RA-03 emergency-flag",
    });
  }

  // RA-03b live emergency queue entry
  for (const qe of input.queueEntries ?? []) {
    if (qe.patientId === p.id && qe.priority === "emergency" && (qe.status === "waiting" || qe.status === "called")) {
      push({
        id: `ra03b:${p.id}:${qe.id}`,
        severity: "critical",
        title: "Emergency-priority queue entry",
        reason: `This patient holds an emergency-priority queue token (#${qe.tokenNo}, status ${qe.status}).`,
        rule: "RA-03b emergency-queue",
      });
    }
  }

  // RA-04 recorded conditions
  for (const c of p.conditions ?? []) {
    if (!c) continue;
    push({
      id: `ra04:${p.id}:${c}`,
      severity: "info",
      title: `Recorded condition — ${c}`,
      reason: "Listed in the patient's condition history; check compatibility with today's plan.",
      rule: "RA-04 condition-context",
    });
  }

  // RA-05 last-visit vitals outside common adult reference ranges
  const lastVisit = input.visits.filter((v) => v.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastVisit?.vitals) {
    const v = lastVisit.vitals as { bp?: string; hr?: number; tempC?: number; spo2?: number };
    const hr = Number(v.hr ?? 0);
    const spo2 = Number(v.spo2 ?? 0);
    if (hr && (hr < 50 || hr > 120)) {
      push({
        id: `ra05:${p.id}:hr:${lastVisit.id}`,
        severity: "warning",
        title: `Unusual heart rate on file (${hr}/min)`,
        reason: `Recorded at the visit on ${lastVisit.date} — outside the 50–120 display range.`,
        rule: "RA-05 vitals-range",
      });
    }
    if (spo2 && spo2 < 92) {
      push({
        id: `ra05:${p.id}:spo2:${lastVisit.id}`,
        severity: "critical",
        title: `Low recorded SpO₂ (${spo2}%)`,
        reason: `Recorded at the visit on ${lastVisit.date}.`,
        rule: "RA-05 vitals-range",
      });
    }
  }

  // RA-06 urgent symptom assessment not yet reviewed
  const unreviewed = input.assessments.find(
    (a) => a.patientId === p.id && a.urgency !== "routine" && !a.reviewOutcome
  );
  if (unreviewed) {
    push({
      id: `ra06:${p.id}:${unreviewed.id}`,
      severity: unreviewed.urgency === "emergency" ? "critical" : "warning",
      title: `Unreviewed ${unreviewed.urgency} symptom assessment`,
      reason: `Assessment ${unreviewed.id} (${unreviewed.suggestedDepartment}) has no clinician review outcome yet.`,
      rule: "RA-06 triage-review",
    });
  }

  // RA-07 missing critical clinical info
  if (!p.allergies || p.allergies.length === 0) {
    push({
      id: `ra07:${p.id}:allergies`,
      severity: "warning",
      title: "No allergy record on file",
      reason: "Absence of a record is not evidence of absence — confirm verbally before prescribing.",
      rule: "RA-07 missing-data",
    });
  }

  return alerts;
}
