"use client";

import * as React from "react";
import { CheckCircle2, CircleDot, Play, UserX, Activity } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, StatCard, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { todayISO } from "@/lib/utils";
import type { Appointment } from "@/lib/types";

export default function DoctorQueue() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const patients = useStore((s) => s.patients);
  const appointments = useStore((s) => s.appointments);
  const setQueueStatus = useStore((s) => s.setQueueStatus);
  const markNoShow = useStore((s) => s.markNoShow);
  const me = doctors.find((d) => d.id === session.doctorId)!;

  const today = todayISO();
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
        title={`Today's queue — ${me.name}`}
        description={`${me.specialty} · Room ${me.room} · ${queue.length} appointments`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting" value={waiting.length} icon={<CircleDot className="size-5" />} tone="warning" sub="Checked in, not seen" />
        <StatCard label="In consultation" value={inProgress.length} icon={<Activity className="size-5" />} tone="primary" sub="Currently with you" />
        <StatCard label="Completed" value={completed.length} icon={<CheckCircle2 className="size-5" />} tone="success" sub={`${Math.round((completed.length / Math.max(queue.length, 1)) * 100)}% of today`} />
      </div>

      <div className="mt-6 space-y-3">
        {queue.length === 0 && (
          <EmptyState emoji="☕" title="No appointments today" description="Enjoy the calm — your schedule is clear." />
        )}
        {queue.map((a) => {
          const p = patients.find((x) => x.id === a.patientId)!;
          const st = a.queueStatus ?? "waiting";
          return (
            <Card key={a.id} className={"p-5 transition-all " + (st === "in-progress" ? "ring-2 ring-primary/40" : "")}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-16 text-center">
                  <p className="font-display text-lg font-bold tabular-nums">{a.time}</p>
                  <p className="text-xs text-muted-foreground">{a.durationMin} min</p>
                </div>
                <Avatar name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{p.id.toUpperCase()}</span></p>
                  <p className="truncate text-sm text-muted-foreground">{a.reason}</p>
                </div>
                {p.allergies.length > 0 && (
                  <Badge variant="destructive">⚠ {p.allergies[0]}</Badge>
                )}
                <div className="flex items-center gap-2">
                  {st === "waiting" && (
                    <>
                      <Badge variant="secondary">Waiting</Badge>
                      <Button size="sm" onClick={() => setQueueStatus(a.id, "in-progress")}>
                        <Play /> Start
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => markNoShow(a.id)}>
                        <UserX /> No-show
                      </Button>
                    </>
                  )}
                  {st === "in-progress" && (
                    <>
                      <Badge variant="sky">In consultation</Badge>
                      <Button size="sm" variant="gradient" onClick={() => setCompleting(a)}>
                        Complete visit
                      </Button>
                    </>
                  )}
                  {st === "completed" && (
                    <Badge variant="success">
                      <CheckCircle2 /> Completed
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <CompleteVisitDialog appt={completing} onClose={() => setCompleting(null)} />
    </>
  );
}

function CompleteVisitDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const patients = useStore((s) => s.patients);
  const addVisit = useStore((s) => s.addVisit);
  const addPrescription = useStore((s) => s.addPrescription);
  const createLab = useStore((s) => s.createLab);
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
  const p = patients.find((x) => x.id === appt.patientId)!;

  function save() {
    if (!appt || !diagnosis.trim()) return;
    addVisit({
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
      addPrescription({
        patientId: appt.patientId,
        doctorId: appt.doctorId,
        items: [
          {
            drug: drug.trim(),
            dosage: dosage.trim() || "—",
            frequency,
            durationDays: Number(duration) || 30,
          },
        ],
      });
    }
    if (withLab && labTest.trim()) {
      createLab({ patientId: appt.patientId, doctorId: appt.doctorId, test: labTest.trim() });
    }
    setQueueStatus(appt.id, "completed");
    onClose();
  }

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Complete visit — ${p.name}`}
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
