"use client";

import * as React from "react";
import { HeartPulse, ClipboardList, Flag, Loader2, Phone } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlanInstruction {
  text: string;
  kind: "instruction" | "task" | "measurement";
  cadence?: string;
}

interface LogRow {
  id: string;
  type: string;
  content: string;
  metricName: string;
  metricValue: string;
  flags: { source: string; flag?: string; hits?: string[] }[];
  createdAt: string;
}

/**
 * Recovery & wellness tracker — built ONLY from the clinician-authored plan
 * attached to the patient's authorized discharge. Data is patient-scoped on
 * the server (patients can never read another patient's recovery data).
 */
export default function RecoveryTrackerPage() {
  const session = useStore((s) => s.session)!;
  const [plan, setPlan] = React.useState<any | null>(null);
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // logging form
  const [type, setType] = React.useState("progress");
  const [content, setContent] = React.useState("");
  const [metricName, setMetricName] = React.useState("");
  const [metricValue, setMetricValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);
  const [flagNote, setFlagNote] = React.useState<string | null>(null);

  const measurementTasks: PlanInstruction[] = React.useMemo(
    () => (plan?.instructions ?? []).filter((i: PlanInstruction) => i.kind === "measurement"),
    [plan]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/recovery", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Could not load your recovery data.");
        return;
      }
      setPlan(data.plan);
      setLogs(data.logs ?? []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (saving || !plan) return;
    setSaving(true);
    setSavedNote(null);
    setFlagNote(null);
    try {
      const res = await fetch("/api/recovery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: content.trim(), metricName: type === "measurement" ? metricName : "", metricValue: type === "measurement" ? metricValue : "" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErr(data.error ?? "Could not save your entry.");
        return;
      }
      if (data.flagged) {
        setFlagNote(
          "One of your entries matches a clinician-set warning rule. Your care team will review it — if you feel you are getting worse, contact the hospital now."
        );
      } else {
        setSavedNote("Saved to your recovery timeline.");
      }
      setContent("");
      setMetricValue("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader kicker="Recovery" title="Recovery tracker" description="Your clinician-approved recovery plan after discharge." />
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your recovery plan…
        </div>
      </>
    );
  }

  if (err) {
    return (
      <>
        <PageHeader kicker="Recovery" title="Recovery tracker" description="Your clinician-approved recovery plan after discharge." />
        <Card className="p-5 text-sm">{err}</Card>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <PageHeader kicker="Recovery" title="Recovery tracker" description="Your clinician-approved recovery plan after discharge." />
        <EmptyState
          emoji="🏡"
          title="No recovery plan recorded yet"
          description="The tracker becomes available when your care team records a recovery plan after a discharge. If you were recently discharged, ask your clinician to add your plan."
          action={<Button variant="outline" onClick={() => useStore.getState().refresh()}><ClipboardList className="size-4" /> Re-check</Button>}
        />
      </>
    );
  }

  const tasks: PlanInstruction[] = plan.instructions.filter((i: PlanInstruction) => i.kind === "task");
  const instructions: PlanInstruction[] = plan.instructions.filter((i: PlanInstruction) => i.kind === "instruction");
  const doneLogs = new Set(logs.filter((l) => l.type === "task_done").map((l) => l.content.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        kicker="Recovery"
        title="Recovery tracker"
        description={`Recovery plan v${plan.version} · attached to discharge ${dateLabel((plan.dischargeAt ?? "").slice(0, 10))} · authored by ${plan.createdByName || "your care team"}`}
      />

      {flagNote && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="flex items-center gap-2 font-semibold"><Flag className="size-4" /> Flagged for your care team</p>
          <p className="mt-1">{flagNote}</p>
        </Card>
      )}
      {savedNote && !flagNote && <Card className="mb-4 border-primary/40 bg-primary/5 p-4 text-sm text-primary">{savedNote}</Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clinician instructions</p>
          <ul className="space-y-2 text-sm">
            {instructions.map((i, idx) => (
              <li key={idx} className="flex gap-2"><HeartPulse className="mt-0.5 size-4 shrink-0 text-primary" />{i.text}{i.cadence ? ` · ${i.cadence}` : ""}</li>
            ))}
            {instructions.length === 0 && <li className="text-muted-foreground">No standing instructions on this plan.</li>}
          </ul>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended tasks</p>
          <div className="space-y-2">
            {tasks.map((t, idx) => {
              const done = doneLogs.has(t.text.trim().toLowerCase());
              return (
                <div key={idx} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className={done ? "line-through opacity-60" : ""}>{t.text}</span>
                  <Badge variant={done ? "success" : "secondary"}>{done ? "Done" : "Pending"}</Badge>
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">No daily tasks are set in this plan.</p>}
          </div>

          {measurementTasks.length > 0 && (
            <p className="mt-5 text-xs text-muted-foreground">
              Measurements this plan asks you to record: {measurementTasks.map((m) => m.text).join(", ")}.
            </p>
          )}

          {(plan.redFlags ?? []).length > 0 && (
            <div className="mt-5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <p className="font-semibold">When to seek treatment urgently (your clinician's escalation rules):</p>
              <ul className="mt-1 list-disc pl-4">
                {plan.redFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record your progress</p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-type">Entry type</Label>
              <select id="rec-type" className="flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="progress">General progress note</option>
                <option value="symptom">Symptom to report</option>
                <option value="task_done">I completed a recommended task</option>
                {measurementTasks.length > 0 && <option value="measurement">Record a measurement</option>}
              </select>
            </div>

            {type === "task_done" ? (
              <div className="space-y-1.5">
                <Label htmlFor="rec-task">Which task</Label>
                <select id="rec-task" className="flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm" value={content} onChange={(e) => setContent(e.target.value)}>
                  <option value="">Select task</option>
                  {tasks.map((t, idx) => (
                    <option key={idx} value={t.text}>{t.text}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="rec-content">{type === "symptom" ? "Describe the symptom" : "How are you recovering?"}</Label>
                <Textarea id="rec-content" rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Serious emergencies always need a phone call, not the tracker." />
              </div>
            )}

            {type === "measurement" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-metric-name">Metric</Label>
                  <select id="rec-metric-name" className="flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm" value={metricName} onChange={(e) => setMetricName(e.target.value)}>
                    <option value="">Select the plan's metric</option>
                    {measurementTasks.map((m, idx) => (
                      <option key={idx} value={m.text}>{m.text}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-metric">Value</Label>
                  <Input id="rec-metric" value={metricValue} onChange={(e) => setMetricValue(e.target.value)} placeholder="e.g. 12 400 steps" />
                </div>
              </div>
            )}

            <Button variant="gradient" className="w-full" disabled={saving || !plan} onClick={submit}>
              {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save to timeline"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Tracker entries are visible to your care team for review only — they never change your prescriptions or treatment automatically. Entries matching clinician-set warning rules are escalated.
            </p>
          </div>

          <div className="mt-5 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Need clinical review?</p>
            <a href="tel:+911234567890" className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm font-semibold text-destructive">
              <Phone className="size-4" /> Call the hospital helpline
            </a>
            <p className="mt-1 text-[10px] text-muted-foreground">Set to the hospital's published number after deployment.</p>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recovery timeline ({logs.length})</p>
        <div className="space-y-3">
          {logs.length === 0 && <EmptyState emoji="📈" title="No entries yet" description="Your recorded progress will build up here." />}
          {logs.map((l) => (
            <Card key={l.id} className={"p-4 " + (l.flags?.length ? "border-warning/50" : "")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary">{l.type.replace(/_/g, " ")}</Badge>
                <p className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-2 text-sm">{l.content || (l.type === "measurement" ? `${l.metricName}: ${l.metricValue}` : "")}</p>
              {l.flags?.length > 0 && (
                <p className="mt-1 text-xs text-warning">⚠ Matched escalation rule ({l.flags.map((f) => f.flag ?? (f.hits ?? []).join(", ")).filter(Boolean).join("; ")}). Your care team will review this entry.</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
