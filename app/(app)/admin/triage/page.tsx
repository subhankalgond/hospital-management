"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { SymptomAssessmentRow } from "@/lib/types";
import { Badge, Button, Card, Input, StatCard, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";

const OUTCOME: { key: NonNullable<SymptomAssessmentRow["reviewOutcome"]>; label: string }[] = [
  { key: "agreed", label: "Agreed with AI" },
  { key: "changed", label: "Changed assessment" },
  { key: "dismissed", label: "Dismissed" },
];

export default function TriageReview() {
  const assessments = useStore((s) => s.symptomAssessments);
  const patients = useStore((s) => s.patients);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"unreviewed" | "emergency" | "all">("unreviewed");

  React.useEffect(() => {
    useStore.getState().refresh();
  }, []);

  const unreviewed = assessments.filter((a) => !a.reviewOutcome);
  const emergency = assessments.filter((a) => a.urgency === "emergency");

  const shown =
    tab === "unreviewed"
      ? unreviewed
      : tab === "emergency"
        ? emergency
        : assessments;

  async function review(a: SymptomAssessmentRow, outcome: string) {
    if (busyId) return;
    setBusyId(a.id);
    setErr(null);
    try {
      const res = await fetch("/api/symptom-assessments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, outcome, note: notes[a.id] ?? "" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setErr(e.error ?? "Review failed.");
      } else {
        await useStore.getState().refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Clinical review"
        title="Triage review"
        description="Patient symptom assessments awaiting clinical judgement. Emergency presentations are flagged automatically by the triage rules engine — review them first."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Emergency presentations"
          value={String(emergency.filter((a) => !a.reviewOutcome).length)}
          tone={emergency.some((a) => !a.reviewOutcome) ? "warning" : "default"}
          sub="flagged by the rules engine (not a diagnosis)"
        />
        <StatCard label="Awaiting review" value={String(unreviewed.length)} tone={unreviewed.length ? "warning" : "default"} />
        <StatCard label="Reviewed" value={String(assessments.length - unreviewed.length)} tone="success" sub="with audit trail" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["unreviewed", `Awaiting review (${unreviewed.length})`],
            ["emergency", "Emergency only"],
            ["all", "All assessments"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              "rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors " +
              (tab === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {err && <Card className="mt-5 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</Card>}

      <div className="mt-5 space-y-4">
        {shown.length === 0 && <EmptyState title="Nothing awaiting review" />}

        {shown.map((a) => {
          const p = patients.find((x) => x.id === a.patientId);
          const extracted = (a.extracted ?? {}) as { symptoms?: string[]; negated?: string[]; duration?: unknown; severity?: unknown };
          return (
            <Card key={a.id} className={a.urgency === "emergency" && !a.reviewOutcome ? "border-destructive/50" : undefined}>
              <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.urgency === "emergency" ? (
                      <Badge variant="destructive">Emergency flag</Badge>
                    ) : a.urgency === "urgent" ? (
                      <Badge variant="warning">Urgent</Badge>
                    ) : (
                      <Badge variant="outline">Routine</Badge>
                    )}
                    <Badge variant="secondary">{a.suggestedDepartment}</Badge>
                    <Badge variant={a.inputMode === "voice" ? "sky" : "outline"}>{a.inputMode === "voice" ? "voice input" : "typed"}</Badge>
                    {a.reviewOutcome ? (
                      <Badge variant="success">Reviewed: {a.reviewOutcome}</Badge>
                    ) : (
                      <Badge variant="warning">Awaiting review</Badge>
                    )}
                  </div>

                  {a.urgency === "emergency" && a.urgencyNote && (
                    <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      Escalation reason: {a.urgencyNote}
                    </p>
                  )}

                  <p className="rounded border bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient report · </span>
                    “{a.transcript}”
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Extracted: {extracted.symptoms?.length ? extracted.symptoms.join(", ") : "—"}
                    {extracted.negated?.length ? ` · negated: ${extracted.negated.join(", ")}` : ""}
                    {extracted.duration != null && extracted.duration !== "" ? ` · duration: ${String(extracted.duration)}` : ""}
                    {extracted.severity != null && extracted.severity !== "" ? ` · severity: ${String(extracted.severity)}` : ""}
                    {" · engine "}
                    {a.engine}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{a.id}</span> ·{" "}
                    {p ? (
                      <>
                        Patient <span className="font-mono">{p.patientCode || a.patientId}</span> · {p.name}
                      </>
                    ) : (
                      "Patient not registered"
                    )}{" "}
                    · {new Date(a.createdAt).toLocaleString()}
                  </p>

                  {(a.reviewNote || a.reviewedBy) && (
                    <p className="text-xs text-muted-foreground">
                      Clinician review: {a.reviewNote || "(no note)"} — {a.reviewedBy}{" "}
                      {a.reviewedAt ? new Date(a.reviewedAt).toLocaleString() : ""}
                    </p>
                  )}
                </div>

                {!a.reviewOutcome && (
                  <div className="flex flex-col gap-2 md:w-64">
                    {OUTCOME.map((o) => (
                      <Button
                        key={o.key}
                        size="sm"
                        variant={o.key === "agreed" ? "default" : "outline"}
                        disabled={busyId === a.id}
                        onClick={() => review(a, o.key)}
                      >
                        {o.key === "changed" || o.key === "dismissed" ? "Mark as " : ""}
                        {o.label}
                      </Button>
                    ))}
                    <Input
                      placeholder="Review note"
                      value={notes[a.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value.slice(0, 500) }))}
                    />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
