"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowLeft, BedDouble, Brain, CheckCircle2, ClipboardList,
  Clock, Loader2, Search, ShieldAlert, Stethoscope, UserRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { TRIAGE_DEMO_LABEL, TRIAGE_NOTICE } from "@/lib/triage";
import type { EmergencyCase, EmergencyPriority, EmergencyStatus, EmergencyVitals, TriageResult } from "@/lib/types";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Textarea,
} from "@/components/ui/primitives";
import { Dialog, DialogContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { statusLabel, statusVariant, priorityBadge, minutesSince, casePatientName } from "@/lib/emergency-ui";

const STATUS_FLOW: EmergencyStatus[] = [
  "arrived", "triage-pending", "triaged", "waiting", "in-assessment",
  "in-treatment", "admitted", "transferred", "discharged", "closed",
];

export default function EmergencyCaseDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const emergencies = useStore((s) => s.emergencies);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const beds = useStore((s) => s.beds);
  const session = useStore((s) => s.session)!;
  const runEmergencyTriage = useStore((s) => s.runEmergencyTriage);
  const confirmEmergencyPriority = useStore((s) => s.confirmEmergencyPriority);
  const setEmergencyStatus = useStore((s) => s.setEmergencyStatus);
  const assignEmergencyDoctor = useStore((s) => s.assignEmergencyDoctor);
  const recordEmergencyVitals = useStore((s) => s.recordEmergencyVitals);
  const recommendBed = useStore((s) => s.recommendBed);
  const changeBedState = useStore((s) => s.changeBedState);
  const refreshBeds = useStore((s) => s.refreshBeds);

  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (session.role === "admin") void refreshBeds();
  }, [session.role, refreshBeds]);

  const c: EmergencyCase | undefined = emergencies.find((x) => x.id === params.id);
  const cId = c?.id ?? "";
  const [analyzing, setAnalyzing] = React.useState<string | null>(null);
  const [triageResult, setTriageResult] = React.useState<TriageResult | null>(null);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [newPriority, setNewPriority] = React.useState<EmergencyPriority>("URGENT");
  const [changeReason, setChangeReason] = React.useState("");
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignDoctor, setAssignDoctor] = React.useState("");
  const [vitalsOpen, setVitalsOpen] = React.useState(false);
  const [bedMsg, setBedMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  if (!c) {
    return (
      <>
        <PageHeader title="Emergency case" />
        <EmptyState emoji="🚑" title="Case not found" description="It may have been registered on another device — refresh to sync."
          action={<Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>} />
      </>
    );
  }

  const patient = c.patientId ? patients.find((p) => p.id === c.patientId) : undefined;
  const doc = doctors.find((d) => d.id === c.assignedDoctorId);
  const reservedBed = beds.find((b) => b.reservedFor === c.id);
  const linkedBed = c.bedId ? beds.find((b) => b.id === c.bedId) : undefined;
  const vitals = c.vitals as EmergencyVitals | null;

  const ANALYSIS_STEPS = [
    "Analyzing patient information…",
    "Analyzing vital signs…",
    "Checking configured risk indicators…",
    "Generating triage recommendation…",
  ];

  async function runTriage() {
    setErr(null);
    for (let i = 0; i < ANALYSIS_STEPS.length; i++) {
      setAnalyzing(ANALYSIS_STEPS[i]);
      await new Promise((r) => setTimeout(r, 550));
    }
    setAnalyzing(null);
    const res = await runEmergencyTriage(cId);
    if (!res.ok) { setErr(res.error ?? "Triage failed."); return; }
    setTriageResult(res.triage ?? null);
  }

  async function confirm(priority: EmergencyPriority, reason?: string) {
    setBusy(true);
    const res = await confirmEmergencyPriority(cId, priority, reason);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Could not confirm priority."); return; }
    setTriageResult(null);
    setChangeOpen(false);
    setChangeReason("");
  }

  async function findBed() {
    if (!c) return;
    setErr(null);
    setBedMsg(null);
    setBusy(true);
    const res = await recommendBed(cId, c.priority);
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Bed search failed."); return; }
    if (!res.bed) { setBedMsg("No beds are currently available — free one up or check the bed board."); return; }
    const r = await changeBedState(res.bed.id, "reserve", { emergencyCaseId: cId });
    if (!r.ok) { setErr(r.error ?? "Could not reserve the bed."); return; }
    setBedMsg(`Bed ${res.bed.label} (${res.bed.wardName}) reserved for this case.`);
  }

  async function admitToBed() {
    if (!c || !reservedBed) return;
    setBusy(true);
    // occupy the reserved bed, then move the case to admitted
    const occupy = await changeBedState(reservedBed.id, "occupy", { patientId: c.patientId ?? undefined });
    if (!occupy.ok) { setBusy(false); setErr(occupy.error ?? "Could not occupy the bed."); return; }
    await setEmergencyStatus(c.id, "admitted");
    setBusy(false);
  }

  const timeline: { label: string; at?: string; icon: React.ReactNode; done: boolean }[] = [
    { label: "Patient arrived", at: c.arrivalAt, icon: <Clock className="size-4" />, done: true },
    { label: "Vitals recorded", at: vitals ? c.updatedAt : undefined, icon: <Activity className="size-4" />, done: Boolean(vitals) },
    { label: "Triage completed", at: c.triageAt, icon: <Brain className="size-4" />, done: Boolean(c.triageAt) },
    { label: "Priority confirmed", at: c.confirmedAt, icon: <CheckCircle2 className="size-4" />, done: Boolean(c.confirmedAt) },
    { label: "Doctor assigned", at: doc ? c.updatedAt : undefined, icon: <Stethoscope className="size-4" />, done: Boolean(doc) },
    { label: "Assessment", at: c.status === "in-assessment" ? c.updatedAt : undefined, icon: <ClipboardList className="size-4" />, done: STATUS_FLOW.indexOf(c.status) >= STATUS_FLOW.indexOf("in-assessment") },
    { label: "Treatment", at: c.status === "in-treatment" ? c.updatedAt : undefined, icon: <ShieldAlert className="size-4" />, done: STATUS_FLOW.indexOf(c.status) >= STATUS_FLOW.indexOf("in-treatment") },
    { label: "Admission / discharge", at: ["admitted", "discharged", "transferred"].includes(c.status) ? c.updatedAt : undefined, icon: <BedDouble className="size-4" />, done: ["admitted", "discharged", "transferred"].includes(c.status) },
  ];

  const effectiveTriage: TriageResult | null = (c.triage as TriageResult | null) ?? triageResult;

  return (
    <>
      <Link href="/emergency" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Emergency Center
      </Link>

      <PageHeader
        title={casePatientName(c, patient?.name)}
        description={`${c.id} · arrived ${new Date(c.arrivalAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · waiting ${minutesSince(c.arrivalAt, nowMs)} min`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant={priorityBadge[c.priority as EmergencyPriority]} className="text-sm">{c.priority}</Badge>
            <Badge variant={statusVariant[c.status as EmergencyStatus]} className="text-sm">{statusLabel[c.status as EmergencyStatus]}</Badge>
          </div>
        }
      />

      {err && (
        <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{err}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {/* Patient + presentation */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4 text-primary" /> Patient</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {patient ? (
                <>
                  <p><span className="text-muted-foreground">Registered patient:</span> <Link href={`/doctor/patients/${patient.id}`} className="font-medium text-primary hover:underline">{patient.name} ({patient.id})</Link></p>
                  <p><span className="text-muted-foreground">Age / gender:</span> {patient.dob ? `${Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000))}y` : "—"} · <span className="capitalize">{patient.gender}</span></p>
                  <p><span className="text-muted-foreground">Emergency contact:</span> {patient.emergencyContact?.name || "—"} {patient.emergencyContact?.phone ? `· ${patient.emergencyContact.phone}` : ""}</p>
                </>
              ) : (
                (() => {
                  const w = c.walkIn as { name?: string; age?: number; gender?: string; contactName?: string; contactPhone?: string } | null;
                  return (
                    <>
                      <p><span className="text-muted-foreground">Walk-in patient:</span> <span className="font-medium">{w?.name ?? "—"}</span></p>
                      <p><span className="text-muted-foreground">Age / gender:</span> {w?.age ?? "—"}y · <span className="capitalize">{w?.gender ?? "—"}</span></p>
                      <p><span className="text-muted-foreground">Emergency contact:</span> {w?.contactName || "—"} {w?.contactPhone ? `· ${w.contactPhone}` : ""}</p>
                    </>
                  );
                })()
              )}
              <p><span className="text-muted-foreground">Department:</span> {c.department || "—"}</p>
              <p><span className="text-muted-foreground">Symptoms:</span> {c.symptoms}</p>
              {c.notes && <p><span className="text-muted-foreground">Notes:</span> {c.notes}</p>}
              {c.trauma && <Badge variant="destructive" className="mt-1">Trauma flagged</Badge>}
            </CardContent>
          </Card>

          {/* Vitals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2"><Activity className="size-4 text-primary" /> Vital signs</span>
                {!vitals && <Button size="sm" variant="outline" onClick={() => setVitalsOpen(true)}>Record vitals</Button>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vitals ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { l: "Heart rate", v: `${vitals.hr}`, u: "BPM" },
                    { l: "Blood pressure", v: vitals.bp, u: "mmHg" },
                    { l: "SpO₂", v: `${vitals.spo2}`, u: "%" },
                    { l: "Respiratory", v: `${vitals.rr}`, u: "/min" },
                    { l: "Temperature", v: `${vitals.tempC}`, u: "°C" },
                    { l: "Glucose", v: `${vitals.glucose}`, u: "mg/dL" },
                    { l: "Consciousness", v: vitals.consciousness, u: "" },
                  ].map((x) => (
                    <div key={x.l} className="rounded-xl border p-3">
                      <p className="text-xs text-muted-foreground">{x.l}</p>
                      <p className="mt-0.5 font-semibold capitalize tabular-nums">{x.v} <span className="text-xs font-normal text-muted-foreground">{x.u}</span></p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vitals recorded yet — required before triage.</p>
              )}
            </CardContent>
          </Card>

          {/* Triage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2"><Brain className="size-4 text-primary" /> AI-assisted triage</span>
                {vitals && !c.triageAt && (
                  <Button size="sm" variant="gradient" onClick={runTriage} disabled={analyzing !== null}>
                    {analyzing ? <Loader2 className="animate-spin" /> : <Brain />} Run AI-Assisted Triage
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analyzing && (
                <div className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                  {ANALYSIS_STEPS.map((s) => (
                    <p key={s} className={cn("flex items-center gap-2 transition-opacity", analyzing === s ? "text-foreground" : "opacity-50")}>
                      {analyzing === s ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5 text-success" />} {s}
                    </p>
                  ))}
                </div>
              )}

              {effectiveTriage && !analyzing && (
                <div className="space-y-3">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Triage recommendation</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Badge variant={priorityBadge[effectiveTriage.aiPriority]} className="text-base">{effectiveTriage.aiPriority}</Badge>
                      <Badge variant="outline" className="text-[10px]">{TRIAGE_DEMO_LABEL}</Badge>
                    </div>
                    <p className="mt-3 text-sm">{effectiveTriage.recommendation}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{effectiveTriage.reasoning}</p>
                    {effectiveTriage.riskIndicators.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {effectiveTriage.riskIndicators.map((r) => (
                          <li key={r} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" /> {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{TRIAGE_NOTICE}</p>

                  {!c.confirmedAt ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="gradient" disabled={busy} onClick={() => confirm(effectiveTriage.aiPriority)}>
                        <CheckCircle2 /> Confirm priority ({effectiveTriage.aiPriority})
                      </Button>
                      <Button variant="outline" onClick={() => setChangeOpen(true)}>Change priority</Button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
                      <p className="font-medium text-success">Final priority: {c.priority} — confirmed by {c.reviewer ?? "staff"}</p>
                      {c.reasonForChange && <p className="mt-0.5 text-xs text-muted-foreground">Reason for change: {c.reasonForChange}</p>}
                    </div>
                  )}
                </div>
              )}

              {!effectiveTriage && !analyzing && !vitals && (
                <p className="text-sm text-muted-foreground">Record vitals to enable triage.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: actions + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {vitals && !c.triageAt && (
                <Button variant="secondary" className="w-full justify-start" onClick={runTriage} disabled={analyzing !== null}>
                  <Brain /> Run triage
                </Button>
              )}
              {!c.confirmedAt && effectiveTriage && (
                <Button variant="secondary" className="w-full justify-start" onClick={() => confirm(effectiveTriage.aiPriority)} disabled={busy}>
                  <CheckCircle2 /> Confirm priority
                </Button>
              )}
              <Button variant="secondary" className="w-full justify-start" onClick={() => setAssignOpen(true)}>
                <Stethoscope /> {doc ? "Change doctor" : "Assign doctor"}
              </Button>

              {c.confirmedAt && !["admitted", "discharged", "transferred", "closed"].includes(c.status) && (
                <Button variant="gradient" className="w-full justify-start" onClick={findBed} disabled={busy}>
                  <Search /> {reservedBed ? `Reserved: ${reservedBed.label}` : "Find suitable bed"}
                </Button>
              )}
              {reservedBed && c.status !== "admitted" && (
                <Button variant="gradient" className="w-full justify-start" onClick={admitToBed} disabled={busy}>
                  <BedDouble /> Admit to bed {reservedBed.label}
                </Button>
              )}
              {linkedBed && <p className="text-xs text-muted-foreground">Bed: {linkedBed.label} · {linkedBed.wardName} · {linkedBed.status.replace(/-/g, " ")}</p>}
              {bedMsg && <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{bedMsg}</p>}

              <div className="pt-2">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Move status to</Label>
                <Select value="" onValueChange={async (v) => {
                  if (!v) return;
                  const r = await setEmergencyStatus(c.id, v as EmergencyStatus);
                  if (!r.ok) setErr(r.error ?? "Could not update status.");
                }}>
                  <SelectTrigger><SelectValue placeholder="Change status…" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FLOW.filter((s) => s !== c.status).map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Case timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {timeline.map((t) => (
                  <li key={t.label} className="relative">
                    <span className={cn(
                      "absolute -left-[29px] flex size-6 items-center justify-center rounded-full border-2 bg-card",
                      t.done ? "border-primary text-primary" : "border-border text-muted-foreground/40"
                    )}>
                      {t.icon}
                    </span>
                    <p className={cn("text-sm font-medium", !t.done && "text-muted-foreground")}>{t.label}</p>
                    {t.at && <p className="text-xs text-muted-foreground">{new Date(t.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change priority dialog */}
      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent title="Change priority" description="The AI recommendation is not the final decision — record yours with a reason.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Final priority</Label>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as EmergencyPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["CRITICAL", "URGENT", "MODERATE", "LOW"] as EmergencyPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-reason">Reason for changing priority *</Label>
              <Textarea id="cp-reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Clinical judgment, information not captured by the tool…" />
            </div>
            <Button
              variant="gradient"
              className="w-full"
              disabled={busy || !changeReason.trim()}
              onClick={() => confirm(newPriority, changeReason.trim())}
            >
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save final priority
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign doctor dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent title="Assign doctor" description="Choose the clinician taking this case.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Doctor</Label>
              <Select value={assignDoctor} onValueChange={setAssignDoctor}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} · {d.department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="gradient"
              className="w-full"
              disabled={!assignDoctor || busy}
              onClick={async () => {
                setBusy(true);
                const r = await assignEmergencyDoctor(c.id, assignDoctor);
                setBusy(false);
                if (!r.ok) { setErr(r.error ?? "Could not assign."); return; }
                setAssignOpen(false);
              }}
            >
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record vitals dialog */}
      <VitalsDialog
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        onSave={async (v) => {
          const r = await recordEmergencyVitals(c.id, v);
          if (!r.ok) { setErr(r.error ?? "Could not record vitals."); return false; }
          return true;
        }}
      />
    </>
  );
}

function VitalsDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (v: EmergencyVitals) => Promise<boolean> }) {
  const [v, setV] = React.useState({ hr: "", bp: "", spo2: "", rr: "", tempC: "", glucose: "", consciousness: "alert" as EmergencyVitals["consciousness"] });
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setErr(null);
    const hr = Number(v.hr), spo2 = Number(v.spo2), rr = Number(v.rr), temp = Number(v.tempC), glu = Number(v.glucose);
    if (!v.hr || !Number.isFinite(hr) || hr < 0 || hr > 300) return setErr("Heart rate must be 0–300 BPM.");
    if (!/^\d{2,3}\/\d{2,3}$/.test(v.bp.trim())) return setErr("Blood pressure must look like 120/80 (mmHg).");
    if (!v.spo2 || !Number.isFinite(spo2) || spo2 < 50 || spo2 > 100) return setErr("SpO₂ must be 50–100%.");
    if (!v.rr || !Number.isFinite(rr) || rr < 0 || rr > 80) return setErr("Respiratory rate must be 0–80/min.");
    if (!v.tempC || !Number.isFinite(temp) || temp < 30 || temp > 45) return setErr("Temperature must be 30–45 °C.");
    if (!v.glucose || !Number.isFinite(glu) || glu < 0 || glu > 1000) return setErr("Glucose must be 0–1000 mg/dL.");
    setBusy(true);
    const ok = await onSave({
      hr, bp: v.bp.trim(), spo2, rr, tempC: temp, glucose: glu, consciousness: v.consciousness,
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record vital signs" className="max-w-xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <VF id="rv-hr" label="Heart rate" unit="BPM" value={v.hr} onChange={(x) => setV((s) => ({ ...s, hr: x }))} />
          <VF id="rv-bp" label="Blood pressure" unit="mmHg" value={v.bp} onChange={(x) => setV((s) => ({ ...s, bp: x }))} placeholder="120/80" />
          <VF id="rv-spo2" label="SpO₂" unit="%" value={v.spo2} onChange={(x) => setV((s) => ({ ...s, spo2: x }))} />
          <VF id="rv-rr" label="Respiratory rate" unit="/min" value={v.rr} onChange={(x) => setV((s) => ({ ...s, rr: x }))} />
          <VF id="rv-temp" label="Temperature" unit="°C" value={v.tempC} onChange={(x) => setV((s) => ({ ...s, tempC: x }))} />
          <VF id="rv-glu" label="Glucose" unit="mg/dL" value={v.glucose} onChange={(x) => setV((s) => ({ ...s, glucose: x }))} />
          <div className="col-span-2 space-y-1.5 sm:col-span-3">
            <Label>Consciousness level</Label>
            <Select value={v.consciousness} onValueChange={(x) => setV((s) => ({ ...s, consciousness: x as EmergencyVitals["consciousness"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="verbal">Responds to verbal</SelectItem>
                <SelectItem value="pain">Responds to pain</SelectItem>
                <SelectItem value="unresponsive">Unresponsive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {err && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{err}</p>}
        <Button variant="gradient" className="mt-4 w-full" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save vitals
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function VF({ id, label, unit, value, onChange, placeholder }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} <span className="font-normal text-muted-foreground">({unit})</span></Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? unit} />
    </div>
  );
}
