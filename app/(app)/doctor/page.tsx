"use client";

import * as React from "react";
import { CheckCircle2, CircleDot, Play, UserX, Activity, ListOrdered, Megaphone, ArrowRight, Volume2, UserCheck, Eye } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, StatCard, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { todayISO } from "@/lib/utils";
import type { Appointment, QueueEntry } from "@/lib/types";
import { computeRiskAlerts } from "@/lib/risk-alerts";
import { RiskAlertList } from "@/components/ui/risk-alerts";

export default function DoctorQueue() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const patients = useStore((s) => s.patients);
  const appointments = useStore((s) => s.appointments);
  const leaves = useStore((s) => s.leaves);
  const setQueueStatus = useStore((s) => s.setQueueStatus);
  const markNoShow = useStore((s) => s.markNoShow);
  const doctorQueue = useStore((s) => s.doctorQueue);
  const refreshDoctorQueue = useStore((s) => s.refreshDoctorQueue);
  const callNextPatient = useStore((s) => s.callNextPatient);
  const queueEntryAction = useStore((s) => s.queueEntryAction);
  const symptomAssessments = useStore((s) => s.symptomAssessments);
  const medicationOrders = useStore((s) => s.medicationOrders);
  const visits = useStore((s) => s.visits);
  const emergencies = useStore((s) => s.emergencies);
  const [qOpen, setQOpen] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<QueueEntry | null>(null);
  const [calling, setCalling] = React.useState(false);
  const [queueError, setQueueError] = React.useState<string | null>(null);
  const me = doctors.find((d) => d.id === session.doctorId);

  if (!me) {
    return (
      <>
        <PageHeader title="Today's queue" />
        <EmptyState
          emoji="🩺"
          title="Doctor profile not found"
          description="Your account exists but has no linked doctor profile."
        />
      </>
    );
  }

  const today = todayISO();
  const onLeaveToday = leaves.some(
    (l) => l.doctorId === me.id && l.status === "approved" && l.fromDate <= today && today <= l.toDate
  );
  const queue = appointments
    .filter((a) => a.doctorId === me.id && a.date === today && a.status !== "cancelled")
    .sort((a, b) => a.time.localeCompare(b.time));

  const waiting = queue.filter((a) => (a.queueStatus ?? "waiting") === "waiting");
  const inProgress = queue.filter((a) => a.queueStatus === "in-progress");
  const completed = queue.filter((a) => a.queueStatus === "completed" || a.status === "completed");

  const [completing, setCompleting] = React.useState<Appointment | null>(null);

  return (
    <>
      <PageHeader
        kicker="Clinician Workspace"
        title={`Today's Queue — ${me.name}`}
        description={`${me.specialty} · Room ${me.room} · ${queue.length} Total Appointments`}
      />

      {onLeaveToday && (
        <div className="mb-6 rounded border border-warning/40 bg-warning/10 px-4 py-3 text-xs">
          <span className="font-semibold uppercase tracking-wider text-warning">Approved Leave Active</span>{" "}
          <span className="text-muted-foreground">The queue below is displayed for record keeping, but new bookings are paused.</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting Queue" value={waiting.length} icon={<CircleDot className="size-4" />} tone="warning" sub="Checked in, pending consultation" />
        <StatCard label="In Consultation" value={inProgress.length} icon={<Activity className="size-4" />} tone="primary" sub="Currently with clinician" />
        <StatCard label="Completed Visits" value={completed.length} icon={<CheckCircle2 className="size-4" />} tone="success" sub={`${Math.round((completed.length / Math.max(queue.length, 1)) * 100)}% completed today`} />
      </div>

      {/* ── Waiting Queue + Call Next Patient (live token engine) ── */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[auto_auto_1fr] items-center rounded-xl border bg-card p-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Live queue · today</p>
          <p className="text-sm font-medium">
            {doctorQueue
              ? `${doctorQueue.waiting} waiting${doctorQueue.currentCalled ? ` · token #${doctorQueue.currentCalled.tokenNo} called` : " · none called"}`
              : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setQOpen(true);
              void refreshDoctorQueue(me.id);
            }}
          >
            <ListOrdered className="size-4" /> Waiting Queue
          </Button>
          <Button
            variant="gradient"
            disabled={calling || (doctorQueue?.waiting ?? 0) === 0}
            onClick={async () => {
              setCalling(true);
              setQueueError(null);
              const r = await callNextPatient();
              if (!r.ok) setQueueError(r.error ?? "Call failed.");
              await refreshDoctorQueue(me.id);
              setCalling(false);
            }}
          >
            <Megaphone className="size-4" /> {calling ? "Calling…" : "Call Next Patient"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {queueError ? (
            <span className="text-destructive font-medium">{queueError}</span>
          ) : (
            <>Emergency-priority tokens are always called first. Called tokens appear on the <a className="underline" href="/display" target="_blank">waiting-room display</a>.</>
          )}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {queue.length === 0 && (
          <EmptyState emoji="☕" title="No appointments scheduled today" description="Enjoy the calm — your schedule is currently clear." />
        )}
        {queue.map((a) => {
          const p = patients.find((x) => x.id === a.patientId);
          const st = a.queueStatus ?? "waiting";
          return (
            <Card key={a.id} className={"p-4 transition-all " + (st === "in-progress" ? "border-primary bg-primary/5" : "")}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-16 text-center border-r border-border/50 pr-4">
                  <p className="font-serif text-lg font-normal tracking-tight tabular-nums text-foreground">{a.time}</p>
                  <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{a.durationMin} min</p>
                </div>
                <Avatar name={p?.name ?? "?"} />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-base font-normal text-foreground">{p?.name ?? "Unknown Patient"} <span className="ml-1 text-[11px] font-mono font-normal text-muted-foreground">({p?.id.toUpperCase()})</span></p>
                  <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
                </div>
                {p && p.allergies.length > 0 && (
                  <Badge variant="destructive">⚠ {p.allergies[0]}</Badge>
                )}
                <div className="flex items-center gap-2">
                  {st === "waiting" && (
                    <>
                      <Badge variant="secondary">Waiting</Badge>
                      <Button size="sm" onClick={() => setQueueStatus(a.id, "in-progress")}>
                        <Play className="size-3.5" /> Start
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => markNoShow(a.id)}>
                        <UserX className="size-3.5" /> No-Show
                      </Button>
                    </>
                  )}
                  {st === "in-progress" && (
                    <>
                      <Badge variant="sky">In Consultation</Badge>
                      <Button size="sm" variant="default" onClick={() => setCompleting(a)}>
                        Complete Visit
                      </Button>
                    </>
                  )}
                  {st === "completed" && (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3.5" /> Completed
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <CompleteVisitDialog appt={completing} onClose={() => setCompleting(null)} />

      {/* ── Live waiting queue dialog (doctor's own session) ── */}
      <Dialog open={qOpen} onOpenChange={(o) => { setQOpen(o); if (!o) setSelectedEntry(null); }}>
        <DialogContent title="Waiting queue — live tokens" description="Your authorized consultation session for today." className="max-w-3xl">
          <QueueList
            doctorId={me.id}
            entries={doctorQueue?.entries ?? []}
            currentCalled={doctorQueue?.currentCalled ?? null}
            selectedEntry={selectedEntry}
            onRefresh={async () => refreshDoctorQueue(me.id)}
            onSelect={(e) => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}
            onAction={async (id, action, opts) => {
              const r = await queueEntryAction(id, action as any, opts);
              if (!r.ok) setQueueError(r.error ?? "Action failed.");
              await refreshDoctorQueue(me.id);
              return r;
            }}
            riskInput={{ patients, appointments, medicationOrders, visits, emergencies, symptomAssessments }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────── Queue dialog internals ─────────────────── */

function QueueList({
  entries,
  currentCalled,
  selectedEntry,
  onSelect,
  onAction,
  onRefresh,
  riskInput,
}: {
  doctorId: string;
  entries: QueueEntry[];
  currentCalled: QueueEntry | null;
  selectedEntry: QueueEntry | null;
  onSelect: (e: QueueEntry) => void;
  onAction: (id: string, action: string, opts?: { note?: string; priority?: "normal" | "emergency" }) => Promise<{ ok: boolean; error?: string }>;
  onRefresh: () => Promise<void>;
  riskInput: { patients: any[]; appointments: any[]; medicationOrders: any[]; visits: any[]; emergencies: any[]; symptomAssessments: any[] };
}) {
  // Live refresh while the dialog is open: another staff member's actions show up here.
  React.useEffect(() => {
    const iv = setInterval(() => void onRefresh(), 10_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waiting = entries.filter((e) => e.status === "waiting");

  if (entries.length === 0) {
    return <EmptyState emoji="🎫" title="No tokens issued for today yet" description="Walk-in and appointment tokens will appear here once issued." />;
  }

  return (
    <div className="space-y-4">
      {currentCalled && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Currently called token</p>
              <div className="flex items-center gap-3">
                <p className="text-3xl font-extrabold tabular-nums text-primary">Token #{currentCalled.tokenNo}</p>
                {currentCalled.priority === "emergency" && <Badge variant="destructive">EMERGENCY</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Patient: <span className="font-semibold text-foreground">{riskInput.patients.find((p: any) => p.id === currentCalled.patientId)?.name ?? "Unknown"}</span>
                {currentCalled.calledAt ? ` · Called ${new Date(currentCalled.calledAt).toLocaleTimeString()}` : ""}
                {currentCalled.calledByName ? ` by ${currentCalled.calledByName}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    const u = new SpeechSynthesisUtterance(`Token number ${currentCalled.tokenNo}, please proceed to the consultation room.`);
                    u.rate = 0.9;
                    window.speechSynthesis.speak(u);
                  }
                }}
              >
                <Volume2 className="size-3.5" /> Repeat Audio Call
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onSelect(currentCalled)}
              >
                <Eye className="size-3.5" /> Live Triage File
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground"
                onClick={() => onAction(currentCalled.id, "missed")}
              >
                <UserX className="size-3.5" /> Mark Missed
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => onAction(currentCalled.id, "done")}
              >
                <CheckCircle2 className="size-3.5" /> Consultation Done
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {[...waiting].reverse().map((e) => (
          <button
            key={e.id}
            onClick={() => onSelect(e)}
            className={
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors " +
              (selectedEntry?.id === e.id ? "border-primary bg-primary/5" : "hover:bg-muted")
            }
          >
            <span className="text-xl font-bold tabular-nums">#{e.tokenNo}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{riskInput.patients.find((p: any) => p.id === e.patientId)?.name ?? "Unknown patient"}</p>
              <p className="truncate text-xs text-muted-foreground">{e.note || "—"} · issued {new Date(e.createdAt).toLocaleTimeString()}</p>
            </div>
            {e.priority === "emergency" && <Badge variant="destructive">EMERGENCY</Badge>}
            {e.source !== "appointment" && <Badge variant="secondary">{e.source.replace("_", " ")}</Badge>}
          </button>
        ))}
      </div>

      {selectedEntry && <TriageFile entry={selectedEntry} onAction={onAction} riskInput={riskInput} />}
    </div>
  );
}

function TriageFile({
  entry,
  onAction,
  riskInput,
}: {
  entry: QueueEntry;
  onAction: (id: string, action: string, opts?: { note?: string; priority?: "normal" | "emergency" }) => Promise<{ ok: boolean; error?: string }>;
  riskInput: { patients: any[]; appointments: any[]; medicationOrders: any[]; visits: any[]; emergencies: any[]; symptomAssessments: any[] };
}) {
  const p = riskInput.patients.find((x) => x.id === entry.patientId);
  // Reuse the patient's EXISTING live triage file: the symptom intake assessment + risk alerts, no duplicate records.
  const assessment = riskInput.symptomAssessments
    .filter((a: any) => a.patientId === entry.patientId)
    .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))[0];
  const alerts = computeRiskAlerts({
    patient: p,
    activeOrders: riskInput.medicationOrders,
    emergencies: riskInput.emergencies,
    visits: riskInput.visits,
    assessments: riskInput.symptomAssessments,
    queueEntries: [entry],
  });
  const [note, setNote] = React.useState(entry.reviewNote ?? "");
  const [busy, setBusy] = React.useState(false);
  const appt = riskInput.appointments.find((a: any) => a.id === entry.appointmentId);

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4" data-patient-key={entry.patientId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Triage file — Token #{entry.tokenNo}</p>
        <a className="text-xs underline text-muted-foreground" href={`/doctor/patients/${entry.patientId}`} target="_blank" rel="noreferrer">
          Open full patient file <ArrowRight className="inline size-3" />
        </a>
      </div>
      <p className="text-sm">{p?.name} · <span className="font-mono text-xs">{p?.patientCode || entry.patientId}</span>{p?.bloodGroup ? ` · ${p.bloodGroup}` : ""}</p>
      {p?.allergies?.length ? <p className="text-sm text-destructive">⚠ Allergies: {p.allergies.join(", ")}</p> : <p className="text-xs text-muted-foreground">No allergy record on file — not evidence of absence.</p>}
      {appt && <p className="text-xs text-muted-foreground">Encounter: {appt.date} {appt.time} · {appt.reason}</p>}

      <RiskAlertList alerts={alerts} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live symptom intake (existing record)</p>
        {assessment ? (
          <div className="mt-1 space-y-1 rounded border bg-card px-3 py-2 text-sm">
            <p>“{assessment.transcript}”</p>
            <p className="text-xs text-muted-foreground">
              Suggested {assessment.suggestedDepartment} · urgency {assessment.urgency} · {assessment.engine} · {new Date(assessment.createdAt).toLocaleString()}
              {assessment.reviewOutcome ? ` · reviewed: ${assessment.reviewOutcome}` : " · awaiting clinician review"}
            </p>
            {assessment.urgencyNote && <p className="text-xs">{assessment.urgencyNote}</p>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No symptom-intake assessment recorded for this patient yet.</p>
        )}
      </div>

      <div>
        <Label htmlFor={`rn-${entry.id}`}>Doctor review note (attaches to this queue entry)</Label>
        <Textarea id={`rn-${entry.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review outcome, urgency decision, instructions…" className="mt-1" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onAction(entry.id, "review_note", { note });
              setBusy(false);
            }}
          >
            Save review note
          </Button>
          {entry.priority === "normal" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await onAction(entry.id, "priority", { priority: "emergency" }); setBusy(false); }}>
              Escalate to emergency priority
            </Button>
          )}
          {entry.priority === "emergency" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await onAction(entry.id, "priority", { priority: "normal" }); setBusy(false); }}>
              Remove emergency priority
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CompleteVisitDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const patients = useStore((s) => s.patients);
  const addVisit = useStore((s) => s.addVisit);
  const createPrescription = useStore((s) => s.createPrescription);
  const createLabOrder = useStore((s) => s.createLabOrder);
  const setQueueStatus = useStore((s) => s.setQueueStatus);

  const [diagnosis, setDiagnosis] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [bp, setBp] = React.useState("120/80");
  const [hr, setHr] = React.useState("72");
  const [temp, setTemp] = React.useState("36.8");
  const [spo2, setSpo2] = React.useState("98");
  const [weight, setWeight] = React.useState("70");
  const [withRx, setWithRx] = React.useState(true);
  const [drug, setDrug] = React.useState("");
  const [dosage, setDosage] = React.useState("");
  const [frequency, setFrequency] = React.useState("Once daily");
  const [duration, setDuration] = React.useState("30");
  const [withLab, setWithLab] = React.useState(false);
  const [labTest, setLabTest] = React.useState("");

  React.useEffect(() => {
    if (appt) {
      setDiagnosis("");
      setNotes("");
      setWithRx(false);
      setWithLab(false);
      setDrug("");
      setDosage("");
      setLabTest("");
    }
  }, [appt]);

  if (!appt) return null;
  const p = patients.find((x) => x.id === appt.patientId);

  async function save() {
    if (!appt || !diagnosis.trim()) return;
    await addVisit({
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      department: useStore.getState().doctors.find((d) => d.id === appt.doctorId)?.department ?? "General Medicine",
      date: appt.date,
      diagnosis: diagnosis.trim(),
      notes: notes.trim(),
      vitals: {
        bp: bp || "—",
        hr: Number(hr) || 0,
        tempC: Number(temp) || 0,
        spo2: Number(spo2) || 0,
        weightKg: Number(weight) || 0,
      },
    });
    if (withRx && drug.trim()) {
      const rx = await createPrescription({
        patientId: appt.patientId,
        items: [
          {
            drug: drug.trim(),
            dosage: dosage.trim() || "as directed",
            route: "oral",
            frequency,
            durationDays: Number(duration) || 30,
          },
        ],
      });
      if (!rx.ok) {
        useStore.getState().toast({ title: "Prescription failed", description: rx.error, variant: "destructive" });
      }
    }
    if (withLab && labTest.trim()) {
      const lab = await createLabOrder({ patientId: appt.patientId, test: labTest.trim() });
      if (!lab.ok) {
        useStore.getState().toast({ title: "Lab order failed", description: lab.error, variant: "destructive" });
      }
    }
    setQueueStatus(appt.id, "completed");
    onClose();
  }

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Complete visit — ${p?.name ?? "patient"}`}
        description={appt.reason}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dx">Diagnosis *</Label>
              <Input id="dx" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Stable angina" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vitals-bp">Vitals — BP / HR</Label>
              <div className="flex gap-2">
                <Input id="vitals-bp" value={bp} onChange={(e) => setBp(e.target.value)} placeholder="120/80" />
                <Input value={hr} onChange={(e) => setHr(e.target.value)} placeholder="72" inputMode="numeric" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vitals-temp">Temp °C</Label>
              <Input id="vitals-temp" value={temp} onChange={(e) => setTemp(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vitals-spo2">SpO₂ %</Label>
              <Input id="vitals-spo2" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vitals-weight">Weight kg</Label>
              <Input id="vitals-weight" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Clinical notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Exam findings, plan, follow-up…" />
          </div>

          <div className="rounded-xl border p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={withRx} onChange={(e) => setWithRx(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
              Issue prescription
            </label>
            {withRx && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="Medication *" />
                <Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Dosage (10mg)" />
                <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Frequency" />
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Days" inputMode="numeric" />
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={withLab} onChange={(e) => setWithLab(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
              Order lab test
            </label>
            {withLab && (
              <Input className="mt-3" value={labTest} onChange={(e) => setLabTest(e.target.value)} placeholder="Test name (CBC, Lipid panel…)" />
            )}
          </div>

          <Button variant="gradient" size="lg" className="w-full" disabled={!diagnosis.trim()} onClick={save}>
            Save visit & complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
