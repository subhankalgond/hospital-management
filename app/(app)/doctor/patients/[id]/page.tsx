"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, ShieldCheck, Pill, FlaskConical, History, FilePen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardContent, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ageFrom, dateLabel } from "@/lib/utils";
import type { MedicationOrder } from "@/lib/types";

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

export default function PatientChart({ params }: { params: { id: string } }) {
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const visits = useStore((s) => s.visits);
  const prescriptions = useStore((s) => s.prescriptions);
  const medicationOrders = useStore((s) => s.medicationOrders);
  const labs = useStore((s) => s.labs);
  const admissions = useStore((s) => s.admissions);
  const createPrescription = useStore((s) => s.createPrescription);
  const createLabOrder = useStore((s) => s.createLabOrder);
  const addVisit = useStore((s) => s.addVisit);

  const p = patients.find((x) => x.id === params.id);

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
  const [labTest, setLabTest] = React.useState("");
  const [labPriority, setLabPriority] = React.useState<"routine" | "urgent" | "stat">("routine");
  const [labNote, setLabNote] = React.useState("");
  const [labBusy, setLabBusy] = React.useState(false);
  const [visBusy, setVisBusy] = React.useState(false);
  const [visDiagnosis, setVisDiagnosis] = React.useState("");
  const [visNotes, setVisNotes] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

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
    setRxBusy(true);
    setActionError(null);
    try {
      const res = await createPrescription({ patientId: patient.id, items });
      if (!res.ok) setActionError(res.error ?? "Could not issue the prescription.");
      else setRxRows([{ ...EMPTY_RX }]);
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
        </TabsList>

        {/* ─── Consultation workspace ─── */}
        <TabsContent value="consult" className="space-y-5">
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

          <Card>
            <CardContent className="p-5">
              <p className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-wider text-muted-foreground">
                <Pill className="size-4" /> Prescribe medications
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Each medication becomes a pharmacy order automatically, plus its billable item on the patient’s invoice.
              </p>
              {rxRows.map((row, i) => (
                <div key={i} className="mb-3 grid gap-2 rounded border p-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`drug${i}`}>Medication</Label>
                    <Input id={`drug${i}`} value={row.drug} onChange={(e) => setRow(i, { drug: e.target.value.slice(0, 120) })} placeholder="e.g. Paracetamol 500mg" />
                  </div>
                  <div>
                    <Label htmlFor={`dosage${i}`}>Dosage</Label>
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
                      <Label htmlFor={`freq${i}`}>Frequency</Label>
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
                    <Label htmlFor={`ins${i}`}>Instructions (optional)</Label>
                    <Input id={`ins${i}`} value={row.instructions} onChange={(e) => setRow(i, { instructions: e.target.value.slice(0, 300) })} placeholder="e.g. after meals with water" />
                  </div>
                  {rxRows.length > 1 && (
                    <button
                      type="button"
                      className="justify-self-start text-xs font-semibold text-destructive underline underline-offset-2"
                      onClick={() => setRxRows((rows) => rows.filter((_, idx) => idx !== i))}
                    >
                      Remove medication
                    </button>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={() => setRxRows((r) => [...r, { ...EMPTY_RX }])}>
                  + Add another medication
                </Button>
                <Button disabled={rxBusy || !p} onClick={submitRx}>
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
      </Tabs>
    </>
  );
}
