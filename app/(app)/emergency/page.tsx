"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Brain, ChevronRight, Loader2, Siren, Sparkles, UserPlus, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import type { EmergencyCase, EmergencyVitals } from "@/lib/types";
import { PRIORITY_ORDER } from "@/lib/types";
import { priorityBadge, statusLabel, statusVariant, minutesSince, casePatientName } from "@/lib/emergency-ui";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  StatCard,
  Textarea,
} from "@/components/ui/primitives";
import { Dialog, DialogContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ageFrom } from "@/lib/utils";
import { DEPARTMENT_NAMES } from "@/lib/defaults";

export default function EmergencyCenter() {
  const emergencies = useStore((s) => s.emergencies);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const router = useRouter();
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [open, setOpen] = React.useState(false);

  // live waiting-time ticker (30s is plenty for minute-level display)
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const active = emergencies.filter((c) => !["discharged", "closed", "transferred"].includes(c.status));
  const count = (fn: (c: EmergencyCase) => boolean) => active.filter(fn).length;

  const queue = [...active].sort((a, b) => {
    const p = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (p !== 0) return p;
    return a.arrivalAt.localeCompare(b.arrivalAt);
  });

  return (
    <>
      <PageHeader
        title="Emergency Center"
        description="Monitor emergency cases, triage priority, and patient flow."
        actions={
          <Button variant="gradient" onClick={() => setOpen(true)}>
            <Siren /> New Emergency Case
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Emergency cases" value={active.length} icon={<Siren className="size-5" />} tone="primary" sub="Currently open" />
        <StatCard label="Critical" value={count((c) => c.priority === "CRITICAL")} icon={<AlertTriangle className="size-5" />} tone={count((c) => c.priority === "CRITICAL") ? "warning" : "default"} sub="Highest priority" />
        <StatCard label="Urgent" value={count((c) => c.priority === "URGENT")} icon={<AlertTriangle className="size-5" />} sub="Seen within 30 min" />
        <StatCard label="Waiting" value={count((c) => c.status === "waiting")} icon={<Users className="size-5" />} sub="Awaiting assessment" />
        <StatCard label="In assessment" value={count((c) => c.status === "in-assessment" || c.status === "in-treatment")} icon={<Brain className="size-5" />} tone="primary" sub="With clinical team" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Emergency queue</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <EmptyState
              emoji="🚑"
              title="No active emergency cases"
              description="Registered cases appear here instantly, sorted by priority and arrival."
              action={<Button onClick={() => setOpen(true)}>Register a case</Button>}
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Patient</th>
                    <th className="px-3 py-3 font-medium">Priority</th>
                    <th className="px-3 py-3 font-medium">Arrival</th>
                    <th className="px-3 py-3 font-medium">Waiting</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Doctor</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((c) => {
                    const p = c.patientId ? patients.find((x) => x.id === c.patientId) : undefined;
                    const doc = doctors.find((d) => d.id === c.assignedDoctorId);
                    const wait = minutesSince(c.arrivalAt, nowMs);
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
                        onClick={() => router.push(`/emergency/${c.id}`)}
                      >
                        <td className="px-3 py-3.5">
                          <p className="font-medium">{casePatientName(c, p?.name)}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.id}
                            {p ? ` · ${ageFrom(p.dob)}y` : c.walkIn ? ` · ${(c.walkIn as { age?: number }).age ?? "?"}y` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge variant={priorityBadge[c.priority]}>{c.priority}</Badge>
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">
                          {new Date(c.arrivalAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={cn("tabular-nums font-medium", wait >= 30 && c.priority === "CRITICAL" ? "text-destructive" : wait >= 60 ? "text-warning" : "")}>
                            {wait < 60 ? `${wait} min` : `${Math.floor(wait / 60)}h ${wait % 60}m`}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">{c.department || "—"}</td>
                        <td className="px-3 py-3.5 text-muted-foreground">{doc?.name ?? "Unassigned"}</td>
                        <td className="px-3 py-3.5">
                          <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewEmergencyDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ─────────────── New Emergency Case dialog ─────────────── */

const EMPTY_VITALS = { hr: "", bp: "", spo2: "", rr: "", tempC: "", glucose: "", consciousness: "alert" as EmergencyVitals["consciousness"] };

function NewEmergencyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const patients = useStore((s) => s.patients);
  const createEmergency = useStore((s) => s.createEmergency);
  const router = useRouter();

  const [tab, setTab] = React.useState<"existing" | "walkin">("existing");
  const [search, setSearch] = React.useState("");
  const [patientId, setPatientId] = React.useState("");

  const [wName, setWName] = React.useState("");
  const [wAge, setWAge] = React.useState("");
  const [wGender, setWGender] = React.useState<"male" | "female" | "other">("female");
  const [wContactName, setWContactName] = React.useState("");
  const [wContactPhone, setWContactPhone] = React.useState("");

  const [symptoms, setSymptoms] = React.useState("");
  const [trauma, setTrauma] = React.useState(false);
  const [vitals, setVitals] = React.useState(EMPTY_VITALS);
  const [withVitals, setWithVitals] = React.useState(true);
  const [department, setDepartment] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const matches = patients
    .filter((p) => `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 8);

  const dupeHint =
    tab === "walkin" &&
    wName.trim().length > 2 &&
    patients.some((p) => p.name.toLowerCase() === wName.trim().toLowerCase());

  function reset() {
    setTab("existing");
    setSearch("");
    setPatientId("");
    setWName(""); setWAge(""); setWGender("female"); setWContactName(""); setWContactPhone("");
    setSymptoms(""); setTrauma(false); setVitals(EMPTY_VITALS); setWithVitals(true);
    setDepartment(""); setNotes(""); setError(null);
  }

  function validate(): string | null {
    if (tab === "existing" && !patientId) return "Select an existing patient or switch to the walk-in tab.";
    if (tab === "walkin") {
      if (!wName.trim()) return "Walk-in patient name is required.";
      const age = Number(wAge);
      if (!wAge || !Number.isFinite(age) || age < 0 || age > 130) return "Age must be between 0 and 130.";
    }
    if (!symptoms.trim()) return "Describe the symptoms.";
    if (!department) return "Choose a department.";
    if (withVitals) {
      const hr = Number(vitals.hr), spo2 = Number(vitals.spo2), rr = Number(vitals.rr), temp = Number(vitals.tempC), glu = Number(vitals.glucose);
      if (!vitals.hr || !Number.isFinite(hr) || hr < 0 || hr > 300) return "Heart rate must be 0–300 BPM.";
      if (!/^\d{2,3}\/\d{2,3}$/.test(vitals.bp.trim())) return "Blood pressure must look like 120/80 (mmHg).";
      if (!vitals.spo2 || !Number.isFinite(spo2) || spo2 < 50 || spo2 > 100) return "SpO₂ must be 50–100%.";
      if (!vitals.rr || !Number.isFinite(rr) || rr < 0 || rr > 80) return "Respiratory rate must be 0–80/min.";
      if (!vitals.tempC || !Number.isFinite(temp) || temp < 30 || temp > 45) return "Temperature must be 30–45 °C.";
      if (!vitals.glucose || !Number.isFinite(glu) || glu < 0 || glu > 1000) return "Glucose must be 0–1000 mg/dL.";
    }
    return null;
  }

  async function submit() {
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    const res = await createEmergency({
      patientId: tab === "existing" ? patientId : undefined,
      walkIn: tab === "walkin"
        ? { name: wName.trim(), age: Number(wAge), gender: wGender, contactName: wContactName.trim(), contactPhone: wContactPhone.trim() }
        : undefined,
      symptoms: symptoms.trim(),
      vitals: withVitals
        ? {
            hr: Number(vitals.hr),
            bp: vitals.bp.trim(),
            spo2: Number(vitals.spo2),
            rr: Number(vitals.rr),
            tempC: Number(vitals.tempC),
            glucose: Number(vitals.glucose),
            consciousness: vitals.consciousness,
          }
        : undefined,
      notes: notes.trim(),
      trauma,
      department,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Could not register the case."); return; }
    onOpenChange(false);
    reset();
    if (res.id) router.push(`/emergency/${res.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent title="New emergency case" description="Find the patient below, or register a walk-in. Vitals feed the AI-assisted triage." className="max-w-2xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "walkin")}>
          <TabsList>
            <TabsTrigger value="existing"><Users className="size-4" /> Existing patient</TabsTrigger>
            <TabsTrigger value="walkin"><UserPlus className="size-4" /> Walk-in</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-2">
            <Label htmlFor="em-search">Search registered patients</Label>
            <Input
              id="em-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or phone…"
            />
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {matches.length === 0 && (
                <p className="rounded-lg bg-muted/60 px-3 py-3 text-center text-sm text-muted-foreground">
                  No match — use the Walk-in tab to register them.
                </p>
              )}
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPatientId(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border p-2.5 text-left text-sm transition-all",
                    patientId === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "bg-card hover:border-primary/40"
                  )}
                >
                  <span>
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{p.phone || p.email} · {ageFrom(p.dob)}y · {p.gender}</span>
                  </span>
                  {patientId === p.id && <Badge>Selected</Badge>}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="walkin" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-name">Full name *</Label>
                <Input id="w-name" value={wName} onChange={(e) => setWName(e.target.value)} placeholder="e.g. Alex Ray" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-age">Age *</Label>
                <Input id="w-age" inputMode="numeric" value={wAge} onChange={(e) => setWAge(e.target.value.replace(/[^\d]/g, ""))} placeholder="years" />
              </div>
              <div className="space-y-1.5">
                <Label>Gender *</Label>
                <Select value={wGender} onValueChange={(v) => setWGender(v as "male" | "female" | "other")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-cphone">Emergency contact phone</Label>
                <Input id="w-cphone" value={wContactPhone} onChange={(e) => setWContactPhone(e.target.value)} placeholder="+1 …" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-cname">Emergency contact name</Label>
              <Input id="w-cname" value={wContactName} onChange={(e) => setWContactName(e.target.value)} placeholder="Family / next of kin" />
            </div>
            {dupeHint && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                A registered patient with this name exists — check the Existing patient tab to avoid duplicates.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label htmlFor="em-symptoms">Symptoms *</Label>
            <Textarea id="em-symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Presenting complaint, onset, severity…" />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={trauma} onChange={(e) => setTrauma(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
            Trauma involved
          </label>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={withVitals} onChange={(e) => setWithVitals(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
              Record vital signs now
            </label>
            {withVitals && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border p-3 sm:grid-cols-3">
                <VitalField id="v-hr" label="Heart rate" unit="BPM" value={vitals.hr} onChange={(v) => setVitals((s) => ({ ...s, hr: v }))} />
                <VitalField id="v-bp" label="Blood pressure" unit="mmHg" value={vitals.bp} onChange={(v) => setVitals((s) => ({ ...s, bp: v }))} placeholder="120/80" />
                <VitalField id="v-spo2" label="SpO₂" unit="%" value={vitals.spo2} onChange={(v) => setVitals((s) => ({ ...s, spo2: v }))} />
                <VitalField id="v-rr" label="Respiratory rate" unit="/min" value={vitals.rr} onChange={(v) => setVitals((s) => ({ ...s, rr: v }))} />
                <VitalField id="v-temp" label="Temperature" unit="°C" value={vitals.tempC} onChange={(v) => setVitals((s) => ({ ...s, tempC: v }))} />
                <VitalField id="v-glu" label="Glucose" unit="mg/dL" value={vitals.glucose} onChange={(v) => setVitals((s) => ({ ...s, glucose: v }))} />
                <div className="col-span-2 space-y-1.5 sm:col-span-3">
                  <Label>Consciousness level</Label>
                  <Select value={vitals.consciousness} onValueChange={(v) => setVitals((s) => ({ ...s, consciousness: v as EmergencyVitals["consciousness"] }))}>
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
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_NAMES.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {symptoms.trim().length > 8 && (
                <NlpDeptHint symptoms={symptoms} current={department} onPick={setDepartment} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-notes">Notes</Label>
              <Input id="em-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context for the care team" />
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button variant="gradient" className="mt-4 w-full" size="lg" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : <Siren />} Register case
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function VitalField({
  id, label, unit, value, onChange, placeholder,
}: {
  id: string; label: string; unit: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} <span className="font-normal text-muted-foreground">({unit})</span></Label>
      <Input
        id={id}
        inputMode={id === "v-bp" ? "text" : "decimal"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? unit}
      />
    </div>
  );
}

/**
 * NLP symptom → department suggestion (decision support). Runs while staff
 * type; picking the suggestion just pre-fills the Select — staff stay in
 * control and can override freely.
 */
function NlpDeptHint({
  symptoms,
  current,
  onPick,
}: {
  symptoms: string;
  current: string;
  onPick: (dept: string) => void;
}) {
  const [hint, setHint] = React.useState<{ department: string; confidence: number; isEmergency: boolean; matchedTerms: string[] } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const text = symptoms.trim();
    if (text.length < 9) { setHint(null); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/nlp/symptoms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          setHint({
            department: data.department,
            confidence: data.confidence,
            isEmergency: data.urgency?.isEmergency ?? false,
            matchedTerms: data.urgency?.matchedTerms ?? [],
          });
        }
      } catch { /* hint is best-effort */ } finally {
        setBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [symptoms]);

  if (busy && !hint) {
    return (
      <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Analyzing symptoms…
      </p>
    );
  }
  if (!hint) return null;

  if (hint.isEmergency) {
    return (
      <p className="mt-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
        <Sparkles className="mr-1 inline size-3" />
        Urgent terms detected ({hint.matchedTerms.slice(0, 3).join(", ")}) — triage will flag this case.
      </p>
    );
  }

  const matches = hint.department === current;
  return (
    <p className="mt-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
      <Sparkles className="mr-1 inline size-3 text-primary" />
      AI suggests <b>{hint.department}</b> ({Math.round(hint.confidence * 100)}%)
      {!matches && (
        <>
          {" — "}
          <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => onPick(hint.department)}>
            use it
          </button>
        </>
      )}
      {" · "}
      <span className="text-muted-foreground">decision support only</span>
    </p>
  );
}
