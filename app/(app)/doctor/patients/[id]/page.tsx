"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, ShieldCheck, Pill, FlaskConical, History, FilePen, HeartPulse, Loader2, ShieldAlert, AlertTriangle, AlertOctagon, CheckCircle2, Search, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardContent, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ageFrom, dateLabel } from "@/lib/utils";
import type { MedicationOrder } from "@/lib/types";
import { computeRiskAlerts } from "@/lib/risk-alerts";
import { RiskAlertList } from "@/components/ui/risk-alerts";

const MO_BADGE: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  pending_review: { label: "At pharmacy — pending review", variant: "warning" },
  verified: { label: "At pharmacy — verified", variant: "sky" },
  dispensing: { label: "Dispensing", variant: "sky" },
  dispensed: { label: "Dispensed", variant: "success" },
  clarification_required: { label: "Clarification requested by pharmacy", variant: "destructive" },
  on_hold: { label: "On hold at pharmacy", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const LAB_WF: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  ordered: { label: "Lab — ordered", variant: "warning" },
  awaiting_sample: { label: "Lab — awaiting sample", variant: "warning" },
  sample_collected: { label: "Lab — sample collected", variant: "sky" },
  processing: { label: "Lab — processing", variant: "sky" },
  result_ready: { label: "Lab — result ready", variant: "secondary" },
  verified: { label: "Lab — verified result", variant: "success" },
  cancelled: { label: "Lab — cancelled", variant: "outline" },
};

interface RxForm {
  drug: string;
  dosage: string;
  route: string;
  frequency: string;
  durationDays: string;
  quantity: string;
  instructions: string;
}

const EMPTY_RX: RxForm = { drug: "", dosage: "", route: "oral", frequency: "", durationDays: "", quantity: "", instructions: "" };

interface PlanRowForm {
  text: string;
  kind: "instruction" | "task" | "measurement";
  cadence: string;
}
const EMPTY_PLAN_ROW: PlanRowForm = { text: "", kind: "instruction", cadence: "" };

const STANDARD_FORMULARY = [
  { drug: "Paracetamol", dosage: "500 mg", route: "oral", frequency: "3× daily (every 8h)", durationDays: "5", quantity: "15", instructions: "Take after meals" },
  { drug: "Amoxicillin", dosage: "500 mg", route: "oral", frequency: "3× daily", durationDays: "7", quantity: "21", instructions: "Finish complete course" },
  { drug: "Metformin", dosage: "500 mg", route: "oral", frequency: "Twice daily", durationDays: "30", quantity: "60", instructions: "With morning & evening meals" },
  { drug: "Atorvastatin", dosage: "20 mg", route: "oral", frequency: "Once daily at bedtime", durationDays: "30", quantity: "30", instructions: "Take at night" },
  { drug: "Omeprazole", dosage: "20 mg", route: "oral", frequency: "Once daily", durationDays: "14", quantity: "14", instructions: "30 mins before breakfast" },
  { drug: "Aspirin", dosage: "75 mg", route: "oral", frequency: "Once daily", durationDays: "30", quantity: "30", instructions: "Take after food" },
  { drug: "Ibuprofen", dosage: "400 mg", route: "oral", frequency: "Twice daily PRN", durationDays: "5", quantity: "10", instructions: "Take with food for pain" },
  { drug: "Lisinopril", dosage: "10 mg", route: "oral", frequency: "Once daily", durationDays: "30", quantity: "30", instructions: "Morning" },
  { drug: "Amlodipine", dosage: "5 mg", route: "oral", frequency: "Once daily", durationDays: "30", quantity: "30", instructions: "Morning" },
  { drug: "Azithromycin", dosage: "500 mg", route: "oral", frequency: "Once daily", durationDays: "3", quantity: "3", instructions: "1h before or 2h after food" },
  { drug: "Losartan", dosage: "50 mg", route: "oral", frequency: "Once daily", durationDays: "30", quantity: "30", instructions: "Morning" },
  { drug: "Metoprolol", dosage: "25 mg", route: "oral", frequency: "Twice daily", durationDays: "30", quantity: "60", instructions: "With meals" },
  { drug: "Pantoprazole", dosage: "40 mg", route: "oral", frequency: "Once daily", durationDays: "14", quantity: "14", instructions: "Before breakfast" },
  { drug: "Ciprofloxacin", dosage: "500 mg", route: "oral", frequency: "Twice daily", durationDays: "5", quantity: "10", instructions: "Every 12h" },
  { drug: "Tramadol", dosage: "50 mg", route: "oral", frequency: "Every 6h PRN", durationDays: "5", quantity: "10", instructions: "For acute pain" },
  { drug: "Warfarin", dosage: "5 mg", route: "oral", frequency: "Once daily (evening)", durationDays: "30", quantity: "30", instructions: "Monitor INR closely" },
  { drug: "Ceftriaxone", dosage: "1 g", route: "iv", frequency: "Once daily", durationDays: "3", quantity: "3", instructions: "Slow IV infusion" },
  { drug: "Salbutamol", dosage: "100 mcg", route: "inhaled", frequency: "2 puffs PRN", durationDays: "30", quantity: "1", instructions: "Inhale via spacer" },
];

export default function PatientChart({ params }: { params: { id: string } }) {
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const visits = useStore((s) => s.visits);
  const prescriptions = useStore((s) => s.prescriptions);
  const medicationOrders = useStore((s) => s.medicationOrders);
  const labs = useStore((s) => s.labs);
  const admissions = useStore((s) => s.admissions);
  const emergencies = useStore((s) => s.emergencies);
  const symptomAssessments = useStore((s) => s.symptomAssessments);
  const appointments = useStore((s) => s.appointments);
  const inventory = useStore((s) => s.inventory);
  const createPrescription = useStore((s) => s.createPrescription);
  const createLabOrder = useStore((s) => s.createLabOrder);
  const addVisit = useStore((s) => s.addVisit);

  const p = patients.find((x) => x.id === params.id);

  const patientAlerts = React.useMemo(() => {
    return computeRiskAlerts({
      patient: p,
      activeOrders: medicationOrders,
      emergencies,
      visits,
      assessments: symptomAssessments,
    });
  }, [p, medicationOrders, emergencies, visits, symptomAssessments]);

  const myVisits = visits
    .filter((v) => v.patientId === params.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myRx = prescriptions
    .filter((rx) => rx.patientId === params.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myOrders = medicationOrders
    .filter((o: MedicationOrder) => o.patientId === params.id)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const myLabs = labs
    .filter((l) => l.patientId === params.id)
    .sort((a, b) => (b.requestedOn ?? "").localeCompare(a.requestedOn ?? ""));
  const myAdmissions = admissions
    .filter((a) => a.patientId === params.id)
    .sort((a, b) => (b.admittedAt ?? "").localeCompare(a.admittedAt ?? ""));
  const activeAdmission = myAdmissions.find((a) => a.status === "active");

  // forms (busy + reset state)
  const [rxRows, setRxRows] = React.useState<RxForm[]>([{ ...EMPTY_RX }]);
  const [rxBusy, setRxBusy] = React.useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = React.useState<string>("");
  const [catalogueQuery, setCatalogueQuery] = React.useState("");
  const [safetyChecks, setSafetyChecks] = React.useState<any | null>(null);
  const [checkingSafety, setCheckingSafety] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState("");

  const [labTest, setLabTest] = React.useState("");
  const [labPriority, setLabPriority] = React.useState<"routine" | "urgent" | "stat">("routine");
  const [labNote, setLabNote] = React.useState("");
  const [labBusy, setLabBusy] = React.useState(false);
  const [visBusy, setVisBusy] = React.useState(false);
  const [visDiagnosis, setVisDiagnosis] = React.useState("");
  const [visNotes, setVisNotes] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Recovery plan (clinician-authored after discharge) — loaded from the
  // audited /api/recovery endpoint; discharges enumerated server-side only.
  const recPat = params.id;
  const [recPlan, setRecPlan] = React.useState<any | null>(null);
  const [recDischarges, setRecDischarges] = React.useState<any[]>([]);
  const [recLogs, setRecLogs] = React.useState<any[]>([]);
  const [recLoading, setRecLoading] = React.useState(true);
  const [recAdmissionId, setRecAdmissionId] = React.useState("");
  const [recRows, setRecRows] = React.useState<PlanRowForm[]>([{ ...EMPTY_PLAN_ROW }]);
  const [recFlags, setRecFlags] = React.useState<string[]>([]);
  const [recFlagDraft, setRecFlagDraft] = React.useState("");
  const [recBusy, setRecBusy] = React.useState(false);
  const [recNote, setRecNote] = React.useState<string | null>(null);

  const loadRecovery = React.useCallback(async () => {
    setRecLoading(true);
    try {
      const res = await fetch(`/api/recovery?patientId=${encodeURIComponent(recPat)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setRecPlan(data.plan ?? null);
        setRecDischarges(data.discharges ?? []);
        setRecLogs(data.logs ?? []);
        setRecAdmissionId((curr: string) => curr || data.plan?.admissionId || data.discharges?.[0]?.id || "");
        if (data.plan) {
          setRecRows(
            ((data.plan.instructions ?? []) as any[]).map((i) => ({ text: i.text ?? "", kind: i.kind ?? "instruction", cadence: i.cadence ?? "" }))
          );
          setRecFlags(((data.plan.redFlags ?? []) as string[]) ?? []);
        }
      }
    } finally {
      setRecLoading(false);
    }
  }, [recPat]);

  React.useEffect(() => {
    void loadRecovery();
  }, [loadRecovery]);

  function setRecRow(i: number, patch: Partial<PlanRowForm>) {
    setRecRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submitRecoveryPlan() {
    if (recBusy || !recAdmissionId) return;
    const instructions = recRows
      .filter((r) => r.text.trim())
      .map((r) => ({ text: r.text.trim(), kind: r.kind, cadence: r.cadence.trim() || undefined }));
    if (instructions.length === 0) {
      setActionError("Add at least one recovery instruction before saving.");
      return;
    }
    setRecBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: recPat, admissionId: recAdmissionId, instructions, redFlags: recFlags }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Could not save the recovery plan.");
        return;
      }
      setRecNote(data.amended ? `Recovery plan amended (v${data.plan?.version ?? "—"}) — patient's tracker updated.` : "Recovery plan published — the patient's tracker is now active.");
      await loadRecovery();
    } finally {
      setRecBusy(false);
    }
  }

  if (!p) {
    return (
      <EmptyState
        title="Patient not found"
        action={
          <Button variant="outline">
            <Link href="/doctor/patients">Back to patients</Link>
          </Button>
        }
      />
    );
  }

  const patient = p;
  const pdoc = (id: string) => doctors.find((d) => d.id === id)?.name ?? "Unknown";

  function setRow(i: number, patch: Partial<RxForm>) {
    setRxRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function runSafetyCheck(inputItems?: { drug: string }[]) {
    const raw = inputItems ?? rxRows.filter((r) => r.drug.trim()).map((r) => ({ drug: r.drug.trim() }));
    if (raw.length === 0) {
      setSafetyChecks(null);
      return null;
    }
    setCheckingSafety(true);
    setActionError(null);
    try {
      const res = await fetch("/api/clinical/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, items: raw }),
      });
      const data = await res.json();
      if (res.ok) {
        setSafetyChecks(data);
        return data;
      } else {
        setActionError(data.error ?? "Could not run clinical interaction check.");
        return null;
      }
    } catch {
      setActionError("Could not reach safety check service.");
      return null;
    } finally {
      setCheckingSafety(false);
    }
  }

  async function submitRx() {
    if (rxBusy) return;
    const items = rxRows
      .filter((r) => r.drug.trim())
      .map((r) => ({
        drug: r.drug.trim(),
        dosage: r.dosage.trim(),
        route: r.route,
        frequency: r.frequency.trim(),
        durationDays: Number(r.durationDays) || 0,
        quantity: Number(r.quantity) || 1,
        instructions: r.instructions.trim() || undefined,
      }));
    if (items.length === 0) {
      setActionError("Add at least one medication.");
      return;
    }

    // Always ensure clinical check is executed before submission
    let checks = safetyChecks;
    if (!checks) {
      checks = await runSafetyCheck(items.map((i) => ({ drug: i.drug })));
    }

    const hasWarnings =
      (checks?.allergyConflicts?.length ?? 0) > 0 ||
      (checks?.duplicateTherapy?.length ?? 0) > 0 ||
      (checks?.interactions?.length ?? 0) > 0;

    if (hasWarnings && !overrideReason.trim()) {
      setActionError("Clinical interaction or allergy warnings flagged. Document a justified clinical decision / override rationale before issuing.");
      return;
    }

    setRxBusy(true);
    setActionError(null);
    try {
      const res = await createPrescription({
        patientId: patient.id,
        visitId: selectedEncounterId || undefined,
        items,
        safetyChecks: checks ?? undefined,
        overrideReason: overrideReason.trim() || undefined,
      });
      if (!res.ok) {
        setActionError(res.error ?? "Could not issue the prescription.");
      } else {
        setRxRows([{ ...EMPTY_RX }]);
        setSafetyChecks(null);
        setOverrideReason("");
      }
    } finally {
      setRxBusy(false);
    }
  }

  async function submitLab() {
    if (labBusy || !labTest.trim()) return;
    setLabBusy(true);
    setActionError(null);
    try {
      const res = await createLabOrder({
        patientId: patient.id,
        test: labTest.trim(),
        priority: labPriority,
        clinicalNote: labNote.trim() || undefined,
      });
      if (!res.ok) setActionError(res.error ?? "Could not order the test.");
      else {
        setLabTest("");
        setLabNote("");
        setLabPriority("routine");
      }
    } finally {
      setLabBusy(false);
    }
  }

  async function submitVisit() {
    if (visBusy) return;
    const session = useStore.getState().session;
    if (!session?.doctorId) {
      setActionError("Only the patient’s treating clinician can record a visit from this account.");
      return;
    }
    setVisBusy(true);
    setActionError(null);
    try {
      const me = doctors.find((d) => d.id === session.doctorId);
      await addVisit({
        patientId: patient.id,
        doctorId: session.doctorId,
        department: me?.department ?? "General Medicine",
        date: new Date().toISOString().slice(0, 10),
        diagnosis: visDiagnosis.trim() || "Assessment pending",
        notes: visNotes.trim(),
        vitals: { bp: "", hr: 0, tempC: 0, spo2: 0, weightKg: 0 },
      });
      setVisDiagnosis("");
      setVisNotes("");
    } finally {
      setVisBusy(false);
    }
  }

  return (
    <>
      <Link
        href="/doctor/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All patients
      </Link>

      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="gradient-primary p-6 text-white">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur-sm">
              {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold">{p.name}</p>
              <p className="text-sm text-white/75">
                Permanent ID{" "}
                <span className="font-mono font-semibold">{p.patientCode ? p.patientCode : "pending"}</span> ·{" "}
                {ageFrom(p.dob)} yrs · {p.gender === "female" ? "Female" : p.gender === "male" ? "Male" : "Other"} · Blood{" "}
                {p.bloodGroup || "—"}
              </p>
              {activeAdmission && (
                <p className="mt-1 text-xs text-white/90">
                  Currently admitted: {activeAdmission.wardName} ({activeAdmission.bedLabel}) since{" "}
                  {dateLabel(activeAdmission.admittedAt.slice(0, 10))} — {activeAdmission.reason || "no reason recorded"}
                </p>
              )}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {p.allergies.map((a) => (
                <span key={a} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
                  ⚠ {a}
                </span>
              ))}
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <p className="flex items-center gap-2">
            <Phone className="size-4 text-muted-foreground" /> {p.phone}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" /> {p.email}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" /> {p.address}
          </p>
          <p className="flex items-center gap-2 sm:col-span-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Insurance {p.insurance?.provider || "—"} · <span className="font-mono">{p.insurance?.number || "—"}</span>
          </p>
          <p className="text-muted-foreground">
            Emergency: {p.emergencyContact?.name} ({p.emergencyContact?.relation}) · {p.emergencyContact?.phone}
          </p>
        </CardContent>
      </Card>

      <div className="mb-4 mt-4 flex justify-end">
        <Button variant="outline" size="sm">
          <Link href={`/doctor/patients/${params.id}/history`} className="flex items-center gap-2">
            <History className="size-4" /> Full history & filters
          </Link>
        </Button>
      </div>

      {actionError && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{actionError}</Card>
      )}

      <Tabs defaultValue="consult">
        <TabsList>
          <TabsTrigger value="consult">Consultation</TabsTrigger>
          <TabsTrigger value="visits">Visits ({myVisits.length})</TabsTrigger>
          <TabsTrigger value="rx">Rx & meds ({myOrders.length || myRx.length})</TabsTrigger>
          <TabsTrigger value="labs">Labs ({myLabs.length})</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
        </TabsList>

        {/* ─── Consultation workspace ─── */}
        <TabsContent value="consult" className="space-y-5">
          {/* Automatic Patient Risk & Contraindication Alert Layer (Rule-based, facts-only) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="size-4 text-warning" /> Automatic Clinical Risk & Contraindication Alerts
              </p>
              <span className="text-[11px] text-muted-foreground">Rules engine v1.1.0 · Facts-based</span>
            </div>
            {patientAlerts.length > 0 ? (
              <RiskAlertList alerts={patientAlerts} />
            ) : (
              <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                No active drug-allergy collisions or critical triage flags detected for current orders.
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-5">
              <p className="mb-3 flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                <FilePen className="size-4" /> Record this visit
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="visDiagnosis">Diagnosis (documented after your assessment)</Label>
                  <Input
                    id="visDiagnosis"
                    value={visDiagnosis}
                    onChange={(e) => setVisDiagnosis(e.target.value.slice(0, 500))}
                    placeholder="e.g. Acute pharyngitis"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="visNotes">Clinical notes</Label>
                  <Textarea id="visNotes" rows={3} value={visNotes} onChange={(e) => setVisNotes(e.target.value.slice(0, 2000))} />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button disabled={visBusy} onClick={submitVisit}>
                  {visBusy ? "Recording…" : "Record visit"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A new visit appends to this patient’s history — previous records are never overwritten.
              </p>
            </CardContent>
          </Card>

          {/* ─── Quick E-Prescription & Drug Interaction Checks ─── */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                    <Pill className="size-4" /> Quick E-Prescription & Drug Interaction Checks
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Direct integration with pharmacy queue & automated openFDA drug-drug interaction safety screening.
                  </p>
                </div>
                {/* Active Encounter Selection */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="rx-encounter" className="text-xs shrink-0">Encounter:</Label>
                  <select
                    id="rx-encounter"
                    className="h-8 rounded border border-input bg-background px-2 text-xs"
                    value={selectedEncounterId}
                    onChange={(e) => setSelectedEncounterId(e.target.value)}
                  >
                    <option value="">Today's consultation (default)</option>
                    {myVisits.slice(0, 5).map((v) => (
                      <option key={v.id} value={v.id}>Visit {v.date} — {v.diagnosis.slice(0, 20)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pre-prescription Allergy & Medication History Glance */}
              <div className="grid gap-2 sm:grid-cols-2 rounded-lg border bg-muted/30 p-3 text-xs">
                <div>
                  <p className="font-semibold text-foreground">Recorded Allergies:</p>
                  {p.allergies.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.allergies.map((a) => (
                        <span key={a} className="rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                          ⚠ {a}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No allergy records on file (not proof of absence).</p>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-foreground">Active Medication Orders ({myOrders.filter((o) => ["pending_review", "verified", "dispensing"].includes(o.status)).length}):</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {myOrders.filter((o) => ["pending_review", "verified", "dispensing"].includes(o.status)).slice(0, 3).map((o) => (
                      <span key={o.id} className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">
                        {o.drug} {o.dosage}
                      </span>
                    ))}
                    {myOrders.filter((o) => ["pending_review", "verified", "dispensing"].includes(o.status)).length === 0 && (
                      <p className="text-muted-foreground">None currently active.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Medication Catalogue Search / Quick Formulary Picker */}
              <div className="space-y-1.5 rounded-lg border border-dashed p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cat-search" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Search className="size-3.5" /> Search Medication Catalogue & Hospital Formulary
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Click any drug to auto-fill</span>
                </div>
                <Input
                  id="cat-search"
                  value={catalogueQuery}
                  onChange={(e) => setCatalogueQuery(e.target.value)}
                  placeholder="Search catalogue (e.g. Paracetamol, Amoxicillin, Metformin, Atorvastatin, Omeprazole…)"
                  className="h-8 text-xs"
                />
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {STANDARD_FORMULARY
                    .filter((m) => !catalogueQuery || m.drug.toLowerCase().includes(catalogueQuery.toLowerCase()))
                    .slice(0, 10)
                    .map((item) => (
                      <button
                        key={item.drug}
                        type="button"
                        onClick={() => {
                          const emptyIdx = rxRows.findIndex((r) => !r.drug.trim());
                          if (emptyIdx >= 0) {
                            setRow(emptyIdx, {
                              drug: item.drug,
                              dosage: item.dosage,
                              route: item.route,
                              frequency: item.frequency,
                              durationDays: item.durationDays,
                              quantity: item.quantity,
                              instructions: item.instructions,
                            });
                          } else {
                            setRxRows((prev) => [
                              ...prev,
                              {
                                drug: item.drug,
                                dosage: item.dosage,
                                route: item.route,
                                frequency: item.frequency,
                                durationDays: item.durationDays,
                                quantity: item.quantity,
                                instructions: item.instructions,
                              },
                            ]);
                          }
                          // trigger safety check
                          void runSafetyCheck([...rxRows.filter((r) => r.drug.trim()), item].map((x) => ({ drug: x.drug })));
                        }}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5 transition-all"
                      >
                        + {item.drug} ({item.dosage})
                      </button>
                    ))}
                </div>
              </div>

              {/* Prescription Items Form */}
              {rxRows.map((row, i) => (
                <div key={i} className="mb-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 bg-card">
                  <div>
                    <Label htmlFor={`drug${i}`}>Medication Name *</Label>
                    <Input
                      id={`drug${i}`}
                      value={row.drug}
                      onChange={(e) => {
                        setRow(i, { drug: e.target.value.slice(0, 120) });
                        setSafetyChecks(null);
                      }}
                      placeholder="e.g. Paracetamol"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`dosage${i}`}>Dosage *</Label>
                    <Input id={`dosage${i}`} value={row.dosage} onChange={(e) => setRow(i, { dosage: e.target.value.slice(0, 60) })} placeholder="e.g. 500 mg" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`route${i}`}>Route</Label>
                      <select
                        id={`route${i}`}
                        className="flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm"
                        value={row.route}
                        onChange={(e) => setRow(i, { route: e.target.value })}
                      >
                        {["oral", "iv", "im", "sc", "topical", "inhaled", "sublingual", "rectal", "ocular", "other"].map((r) => (
                          <option key={r} value={r}>
                            {r.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`freq${i}`}>Frequency *</Label>
                      <Input id={`freq${i}`} value={row.frequency} onChange={(e) => setRow(i, { frequency: e.target.value.slice(0, 60) })} placeholder="e.g. 3× daily" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`dur${i}`}>Duration (days)</Label>
                      <Input id={`dur${i}`} type="number" min={0} max={365} value={row.durationDays} onChange={(e) => setRow(i, { durationDays: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`qty${i}`}>Quantity (units)</Label>
                      <Input id={`qty${i}`} type="number" min={1} max={365} value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`ins${i}`}>Instructions</Label>
                    <Input id={`ins${i}`} value={row.instructions} onChange={(e) => setRow(i, { instructions: e.target.value.slice(0, 300) })} placeholder="e.g. after meals with water" />
                  </div>
                  {rxRows.length > 1 && (
                    <button
                      type="button"
                      className="justify-self-start text-xs font-semibold text-destructive underline underline-offset-2"
                      onClick={() => {
                        setRxRows((rows) => rows.filter((_, idx) => idx !== i));
                        setSafetyChecks(null);
                      }}
                    >
                      Remove medication
                    </button>
                  )}
                </div>
              ))}

              {/* Clinical Safety & Drug-Drug Interaction Results Box */}
              {safetyChecks && (
                <div className="space-y-3 rounded-xl border border-primary/40 bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-primary" />
                      <p className="font-semibold text-sm">Clinical Interaction Screening Results</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Source: {safetyChecks.knowledgeSource?.name} · {safetyChecks.engineVersion}
                    </span>
                  </div>

                  {/* Allergy conflicts */}
                  {safetyChecks.allergyConflicts?.length > 0 && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                      <p className="font-bold flex items-center gap-1.5"><AlertOctagon className="size-4" /> ALLERGY CONFLICT DETECTED</p>
                      {safetyChecks.allergyConflicts.map((c: any, idx: number) => (
                        <p key={idx} className="mt-1">
                          • Prescribed <b>{c.drug}</b> matches recorded patient allergy <b>"{c.allergy}"</b>.
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Duplicate therapy */}
                  {safetyChecks.duplicateTherapy?.length > 0 && (
                    <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
                      <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="size-4" /> DUPLICATE THERAPY DETECTED</p>
                      {safetyChecks.duplicateTherapy.map((d: any, idx: number) => (
                        <p key={idx} className="mt-1">
                          • Prescribed <b>{d.drug}</b> duplicates active order {d.activeOrder.id} ({d.activeOrder.drug}).
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Drug-drug interactions from openFDA */}
                  {safetyChecks.interactions?.length > 0 && (
                    <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-warning space-y-2">
                      <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="size-4" /> DRUG-DRUG INTERACTIONS (FDA Labeling)</p>
                      {safetyChecks.interactions.map((it: any, idx: number) => (
                        <div key={idx} className="rounded border border-warning/30 bg-background/50 p-2">
                          <p className="font-semibold text-foreground">Interaction: {it.drugA} ⟷ {it.drugB}</p>
                          <p className="mt-1 italic text-muted-foreground text-[11px]">"{it.labelingExcerpt}"</p>
                          {it.labelUrl && (
                            <a href={it.labelUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] text-primary underline">
                              View FDA Approved Label Section →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Missing data notices */}
                  {safetyChecks.missingData?.length > 0 && (
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold flex items-center gap-1"><Info className="size-3.5" /> Clinical Context Notices:</p>
                      {safetyChecks.missingData.map((m: string, idx: number) => (
                        <p key={idx} className="text-[11px]">• {m}</p>
                      ))}
                    </div>
                  )}

                  {/* Knowledge source unavailable warning */}
                  {safetyChecks.unavailable && (
                    <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
                      <p className="font-semibold">FDA drug-label service unreachable</p>
                      <p className="mt-1">{safetyChecks.unavailableReason}</p>
                    </div>
                  )}

                  {safetyChecks.allergyConflicts?.length === 0 &&
                    safetyChecks.duplicateTherapy?.length === 0 &&
                    safetyChecks.interactions?.length === 0 && (
                      <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success font-medium">
                        <CheckCircle2 className="size-4" /> No known drug-drug collisions or allergy conflicts detected for these items.
                      </div>
                    )}
                </div>
              )}

              {/* Clinician Override Rationale (Required when warnings exist) */}
              {((safetyChecks?.allergyConflicts?.length ?? 0) > 0 ||
                (safetyChecks?.duplicateTherapy?.length ?? 0) > 0 ||
                (safetyChecks?.interactions?.length ?? 0) > 0) && (
                <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4 space-y-2">
                  <Label htmlFor="overrideReason" className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> Clinician Review & Override Justification (Required for Audit Trail) *
                  </Label>
                  <Textarea
                    id="overrideReason"
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Document clinical justification (e.g. Benefits outweigh interaction risk; dosage adjusted; monitored closely; patient tolerates combination)…"
                    className="text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This justification is permanently attached to the prescription and recorded in the audit trail.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setRxRows((r) => [...r, { ...EMPTY_RX }])}>
                    + Add medication
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={checkingSafety || rxRows.every((r) => !r.drug.trim())}
                    onClick={() => runSafetyCheck()}
                  >
                    {checkingSafety ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
                    Check Interactions & Safety
                  </Button>
                </div>
                <Button
                  disabled={
                    rxBusy ||
                    !p ||
                    rxRows.every((r) => !r.drug.trim()) ||
                    (((safetyChecks?.allergyConflicts?.length ?? 0) > 0 ||
                      (safetyChecks?.duplicateTherapy?.length ?? 0) > 0 ||
                      (safetyChecks?.interactions?.length ?? 0) > 0) &&
                      !overrideReason.trim())
                  }
                  onClick={submitRx}
                >
                  {rxBusy ? "Issuing…" : "Issue prescription"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                <FlaskConical className="size-4" /> Order a laboratory test
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                The order is routed to the Laboratory Panel automatically and its billable item is added to the invoice.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="labTest">Test</Label>
                  <Input id="labTest" value={labTest} onChange={(e) => setLabTest(e.target.value.slice(0, 160))} placeholder="e.g. Complete Blood Count" />
                </div>
                <div>
                  <Label htmlFor="labPriority">Priority</Label>
                  <select
                    id="labPriority"
                    className="flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm"
                    value={labPriority}
                    onChange={(e) => setLabPriority(e.target.value as "routine" | "urgent" | "stat")}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="labNote">Clinical note (optional)</Label>
                  <Input id="labNote" value={labNote} onChange={(e) => setLabNote(e.target.value.slice(0, 500))} placeholder="e.g. fasting sample required" />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button disabled={labBusy || !labTest.trim()} onClick={submitLab}>
                  {labBusy ? "Ordering…" : "Order test"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Visits ─── */}
        <TabsContent value="visits" className="space-y-4">
          {myVisits.length === 0 && <EmptyState title="No visits on record yet" />}
          {myVisits.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{v.diagnosis}</p>
                  <p className="text-sm text-muted-foreground">
                    {dateLabel(v.date)} · {v.department} · seen by {pdoc(v.doctorId)}
                  </p>
                </div>
                <Badge variant="outline">{v.id}</Badge>
              </div>
              {v.notes && <p className="mt-2 text-sm">{v.notes}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { k: "BP", v: v.vitals?.bp || "—" },
                  { k: "HR", v: v.vitals?.hr ? `${v.vitals.hr} bpm` : "—" },
                  { k: "Temp", v: v.vitals?.tempC ? `${v.vitals.tempC}°C` : "—" },
                  { k: "SpO₂", v: v.vitals?.spo2 ? `${v.vitals.spo2}%` : "—" },
                  { k: "Weight", v: v.vitals?.weightKg ? `${v.vitals.weightKg} kg` : "—" },
                ].map((x) => (
                  <div key={x.k} className="rounded-lg bg-muted/60 px-2.5 py-2 text-center">
                    <p className="text-[11px] text-muted-foreground">{x.k}</p>
                    <p className="text-sm font-semibold tabular-nums">{x.v}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Medication orders / prescriptions ─── */}
        <TabsContent value="rx" className="space-y-4">
          {myOrders.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pharmacy queue status (live)</p>
              {myOrders.map((o) => (
                <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {o.drug} {o.dosage} · {o.route.toUpperCase()} · {o.frequency || "—"} ·{" "}
                      {o.durationDays ? `${o.durationDays}d` : ""}
                      {o.quantity ? ` · qty ${o.quantity}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{o.id}</span> · issued {new Date(o.createdAt).toLocaleString()}
                      {o.noteFromPharmacy ? ` · note: ${o.noteFromPharmacy}` : ""}
                    </p>
                  </div>
                  {(() => {
                    const v = MO_BADGE[o.status] ?? { label: o.status, variant: "outline" as const };
                    return <Badge variant={v.variant}>{v.label}</Badge>;
                  })()}
                </Card>
              ))}
            </div>
          )}
          {myRx.length === 0 && myOrders.length === 0 && <EmptyState title="No prescriptions on record" />}
          {myRx.map((rx) => (
            <Card key={rx.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill className="size-5 text-primary" />
                  <p className="font-semibold">{dateLabel(rx.date)}</p>
                  <Badge variant={rx.active ? "success" : "outline"}>{rx.active ? "Active" : "Completed"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">by {pdoc(rx.doctorId)}</p>
              </div>
              <div className="mt-3 space-y-2">
                {rx.items.map((it, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <p className="font-medium">{it.drug}</p>
                    <p className="text-sm text-muted-foreground">
                      {it.dosage} · {it.frequency} · {it.durationDays} days
                      {it.instructions ? ` — ${it.instructions}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Labs ─── */}
        <TabsContent value="labs" className="space-y-3">
          {myLabs.length === 0 && <EmptyState title="No lab orders on record" />}
          {myLabs.map((l) => {
            const wf = l.workflow ?? "ordered";
            const v = LAB_WF[wf] ?? { label: wf, variant: "outline" as const };
            return (
              <Card key={l.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {l.test} {l.priority && l.priority !== "routine" ? `(${l.priority.toUpperCase()})` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{l.id}</span> · ordered {dateLabel(l.requestedOn)} · by {pdoc(l.doctorId)}
                    </p>
                  </div>
                  <Badge variant={v.variant}>{v.label}</Badge>
                </div>
                {l.result && (
                  <div className="mt-2 rounded border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Result{wf === "verified" ? " · verified" : " · pending verification"}
                      {l.verifiedByName ? ` by ${l.verifiedByName}` : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{l.result}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── Recovery plan (author after discharge) ─── */}
        <TabsContent value="recovery" className="space-y-4">
          {recLoading ? (
            <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading recovery data…
            </Card>
          ) : (
            <>
              {recNote && <Card className="border-success/40 bg-success/5 p-4 text-sm text-success">{recNote}</Card>}

              {recPlan ? (
                <Card className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold">
                      <HeartPulse className="size-4 text-primary" /> Active plan (v{recPlan.version})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Discharge {dateLabel((recPlan.dischargeAt ?? "").slice(0, 10))} · authored by {recPlan.createdByName || "—"}
                    </p>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {recPlan.instructions?.length ? (
                      recPlan.instructions.map((i: any, idx: number) => (
                        <li key={idx}>
                          <Badge variant="outline" className="mr-2 align-middle">
                            {i.kind}
                          </Badge>
                          {i.text}
                          {i.cadence ? ` · ${i.cadence}` : ""}
                        </li>
                      ))
                    ) : (
                      <li className="text-muted-foreground">No instructions on this plan.</li>
                    )}
                  </ul>
                  {(recPlan.redFlags ?? []).length > 0 && (
                    <p className="mt-3 rounded bg-warning/10 px-3 py-2 text-xs">
                      Escalation phrases: {recPlan.redFlags.join(" · ")}
                    </p>
                  )}
                </Card>
              ) : (
                recDischarges.length === 0 && (
                  <EmptyState
                    emoji="🏡"
                    title="No discharge to plan for yet"
                    description="A recovery plan can only be authored against a real, authorized discharge record. Once the patient is discharged (bed management → discharge), author the plan here."
                  />
                )
              )}

              <Card className="p-5">
                <p className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                  <HeartPulse className="size-4" /> {recPlan ? "Amend recovery plan" : "Author recovery plan"}
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Sent straight to the patient's Recovery tracker — never synthesized or auto-generated. Measurement rows define what the patient may record; anything else is rejected server-side.
                </p>

                <div className="mb-4 max-w-md">
                  <Label htmlFor="recAdmission">Discharge record</Label>
                  <select
                    id="recAdmission"
                    className="mt-1.5 flex h-10 w-full rounded-xs border border-input bg-background px-3 py-2 text-sm"
                    value={recAdmissionId}
                    onChange={(e) => setRecAdmissionId(e.target.value)}
                  >
                    <option value="">Select a discharge record</option>
                    {recDischarges.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} · discharged {dateLabel((d.dischargedAt ?? d.admittedAt ?? "").slice(0, 10))}
                        {d.reason ? ` · ${String(d.reason).slice(0, 60)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  {recRows.map((row, i) => (
                    <div key={i} className="grid gap-2 rounded border p-3 sm:grid-cols-12">
                      <div className="sm:col-span-7">
                        <Label htmlFor={`recText${i}`}>Instruction</Label>
                        <Input id={`recText${i}`} value={row.text} onChange={(e) => setRecRow(i, { text: e.target.value.slice(0, 500) })} placeholder="e.g. Walk at least 20 minutes daily" />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor={`recKind${i}`}>Type</Label>
                        <select
                          id={`recKind${i}`}
                          className="mt-1.5 flex h-10 w-full rounded-xs border border-input bg-background px-2 py-2 text-sm"
                          value={row.kind}
                          onChange={(e) => setRecRow(i, { kind: e.target.value as PlanRowForm["kind"] })}
                        >
                          <option value="instruction">Instruction</option>
                          <option value="task">Daily task</option>
                          <option value="measurement">Measurement</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor={`recCadence${i}`}>Cadence</Label>
                        <Input id={`recCadence${i}`} value={row.cadence} onChange={(e) => setRecRow(i, { cadence: e.target.value.slice(0, 60) })} placeholder="e.g. daily" />
                      </div>
                      <div className="flex items-end sm:col-span-1">
                        {recRows.length > 1 && (
                          <button type="button" className="mb-2 text-xs font-semibold text-destructive underline underline-offset-2" onClick={() => setRecRows((rows) => rows.filter((_, idx) => idx !== i))}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => setRecRows((r) => [...r, { ...EMPTY_PLAN_ROW }])}>
                    + Add another recovery instruction
                  </Button>
                </div>

                <div className="mt-4 rounded border border-warning/40 bg-warning/5 p-3">
                  <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Escalation phrases (red flags)</p>
                  <p className="mb-2 mt-1 text-xs text-muted-foreground">
                    If a logged entry contains one of these phrases it is flagged for clinical review — never auto-acted on.
                  </p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {recFlags.map((f, i) => (
                      <Badge key={i} variant="warning" className="gap-1 pr-1">
                        {f}
                        <button type="button" className="ml-1 rounded-full px-1 hover:bg-warning/20" onClick={() => setRecFlags((fl) => fl.filter((_, idx) => idx !== i))}>
                          ✕
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={recFlagDraft} onChange={(e) => setRecFlagDraft(e.target.value.slice(0, 200))} placeholder="e.g. fever above 39°C" className="max-w-md" />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!recFlagDraft.trim()}
                      onClick={() => {
                        setRecFlags((fl) => [...fl, recFlagDraft.trim()]);
                        setRecFlagDraft("");
                      }}
                    >
                      Add phrase
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button variant="gradient" disabled={recBusy || !recAdmissionId} onClick={submitRecoveryPlan}>
                    {recBusy ? <>< Loader2 className="size-4 animate-spin" /> Saving…</> : recPlan ? "Save amended plan" : "Publish plan to patient"}
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <p className="mb-3 font-semibold uppercase tracking-wider text-muted-foreground">Patient tracker activity ({recLogs.length})</p>
                {recLogs.length === 0 && <p className="text-sm text-muted-foreground">No patient entries yet.</p>}
                <div className="space-y-2">
                  {recLogs.slice(0, 20).map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                      <span>
                        <Badge variant={l.flags?.length ? "warning" : "secondary"}>{l.type.replace(/_/g, " ")}</Badge>
                        <span className="ml-2">{l.content || (l.metricName ? `${l.metricName}: ${l.metricValue}` : "")}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
