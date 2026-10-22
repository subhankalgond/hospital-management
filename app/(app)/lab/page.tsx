"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardContent, Input, Label, StatCard, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";

const WF_BADGE: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  ordered: { label: "Ordered", variant: "secondary" },
  awaiting_sample: { label: "Awaiting sample", variant: "warning" },
  sample_collected: { label: "Sample collected", variant: "sky" },
  processing: { label: "Processing", variant: "sky" },
  result_ready: { label: "Result ready", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const FILTERS: { key: string; label: string; match: (w: string, s: string) => boolean }[] = [
  { key: "queue", label: "Active queue", match: (w) => !["verified", "cancelled"].includes(w) },
  { key: "all", label: "All", match: () => true },
  { key: "verified", label: "Verified", match: (w) => w === "verified" },
  { key: "cancelled", label: "Cancelled", match: (w) => w === "cancelled" },
];

export default function LabPanel() {
  const labs = useStore((s) => s.labs);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const labAction = useStore((s) => s.labAction);
  const [filterKey, setFilterKey] = React.useState("queue");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [resultDraft, setResultDraft] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    useStore.getState().refresh();
    const iv = setInterval(() => useStore.getState().refresh(), 20_000);
    return () => clearInterval(iv);
  }, []);

  const f = FILTERS.find((x) => x.key === filterKey) ?? FILTERS[0];
  const filtered = labs
    .filter((l) => f.match(l.workflow ?? "ordered", l.status))
    .sort((a, b) => {
      const pr = { stat: 0, urgent: 1, routine: 2 } as Record<string, number>;
      return (pr[a.priority ?? "routine"] ?? 2) - (pr[b.priority ?? "routine"] ?? 2) ||
        (b.requestedOn ?? "").localeCompare(a.requestedOn ?? "");
    });

  const activeCount = labs.filter((l) => !["verified", "cancelled"].includes(l.workflow ?? "ordered")).length;
  const awaitingSample = labs.filter((l) => l.workflow === "ordered" || l.workflow === "awaiting_sample").length;
  const readyToVerify = labs.filter((l) => l.workflow === "result_ready").length;

  const pinfo = (id: string) => patients.find((p) => p.id === id);
  const dname = (id: string) => doctors.find((d) => d.id === id)?.name ?? "—";

  async function act(id: string, action: "collect" | "process" | "result" | "verify" | "cancel") {
    if (busyId) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await labAction(id, action, action === "result" ? resultDraft[id] ?? "" : undefined);
      if (!res.ok) setErr(res.error ?? "Action failed.");
      else if (action === "result") setResultDraft((d) => ({ ...d, [id]: "" }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        kicker="Laboratory"
        title="Laboratory"
        description="Tests ordered during consultations arrive automatically. Record the real sample, processing and result data — verification releases results to the doctor and the patient history."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active queue" value={String(activeCount)} tone={activeCount ? "warning" : "default"} />
        <StatCard label="Awaiting sample" value={String(awaitingSample)} />
        <StatCard label="Ready to verify" value={String(readyToVerify)} tone={readyToVerify ? "warning" : "default"} />
      </div>

      {err && <Card className="mt-5 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</Card>}

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <button
            key={x.key}
            onClick={() => setFilterKey(x.key)}
            className={
              "rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors " +
              (filterKey === x.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted")
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {filtered.length === 0 && <EmptyState title="No lab orders here" />}

        {filtered.map((l) => {
          const wf = l.workflow ?? "ordered";
          const p = pinfo(l.patientId);
          const busy = busyId === l.id;
          const isUrgent = l.priority === "stat" || l.priority === "urgent";
          return (
            <Card key={l.id} className={isUrgent ? "border-warning/50" : undefined}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-lg">{l.test}</p>
                      {isUrgent && <Badge variant="warning">{l.priority === "stat" ? "STAT" : "Urgent"}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Order <span className="font-mono">{l.id}</span> · Patient{" "}
                      <span className="font-mono">{p?.patientCode || l.patientId}</span> · {p?.name ?? "—"}
                      {p?.allergies?.length ? (
                        <span className="text-destructive"> · allergies: {p.allergies.join(", ")}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Ordered by {dname(l.doctorId)} · {dateLabel(l.requestedOn)}
                      {l.visitId ? ` · visit ${l.visitId}` : ""}
                    </p>
                    {l.clinicalNote && <p className="mt-1 text-sm">“{l.clinicalNote}”</p>}
                    {(l.sampleCollectedAt || l.processedAt || l.verifiedByName) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {l.sampleCollectedAt && `Sample ${dateLabel(l.sampleCollectedAt.slice(0, 10))}`}
                        {l.processedAt && ` · processed ${dateLabel(l.processedAt.slice(0, 10))}`}
                        {l.verifiedByName && ` · verified by ${l.verifiedByName} ${l.verifiedAt ? dateLabel(l.verifiedAt.slice(0, 10)) : ""}`}
                      </p>
                    )}
                    {l.cancelledReason && (
                      <p className="mt-1 text-xs text-destructive">Cancelled: {l.cancelledReason}</p>
                    )}
                  </div>
                  {(() => {
                    const v = WF_BADGE[wf];
                    return <Badge variant={v.variant}>{v.label}</Badge>;
                  })()}
                </div>

                {/* recorded result — visible once entered */}
                {l.result && (
                  <div className="mt-3 rounded border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recorded result</p>
                    <p className="mt-1 whitespace-pre-wrap">{l.result}</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-3">
                  {wf === "ordered" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "collect")}>
                      {busy ? "Working…" : "Sample collected"}
                    </Button>
                  )}
                  {wf === "sample_collected" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "process")}>
                      {busy ? "Working…" : "Start processing"}
                    </Button>
                  )}
                  {(wf === "sample_collected" || wf === "processing") && (
                    <>
                      <div className="w-full max-w-md">
                        <Label htmlFor={`res-${l.id}`}>Result values (actual data only)</Label>
                        <Input
                          id={`res-${l.id}`}
                          value={resultDraft[l.id] ?? ""}
                          placeholder="e.g. Hemoglobin 11.8 g/dL; WBC 7.2 ×10⁹/L"
                          onChange={(e) => setResultDraft((d) => ({ ...d, [l.id]: e.target.value.slice(0, 4000) }))}
                        />
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => act(l.id, "result")}>
                        {busy ? "Saving…" : "Record result"}
                      </Button>
                    </>
                  )}
                  {wf === "result_ready" && (
                    <Button size="sm" disabled={busy} onClick={() => act(l.id, "verify")}>
                      {busy ? "Verifying…" : "Verify result"}
                    </Button>
                  )}
                  {!["verified", "cancelled"].includes(wf) && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(l.id, "cancel")}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
