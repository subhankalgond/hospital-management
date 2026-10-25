"use client";

import * as React from "react";
import { CalendarPlus, TicketPlus, Siren } from "lucide-react";
import { useStore } from "@/lib/store";
import type { AppointmentStatus, Patient } from "@/lib/types";
import { Avatar, Badge, Button, Card, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";

const FILTERS: { value: AppointmentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "confirmed", label: "Confirmed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No-show" },
];

export default function AdminAppointments() {
  const appointments = useStore((s) => s.appointments);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const confirmAppointment = useStore((s) => s.confirmAppointment);
  const cancelAppointment = useStore((s) => s.cancelAppointment);
  const markNoShow = useStore((s) => s.markNoShow);
  const bookAppointment = useStore((s) => s.bookAppointment);
  const slotsFor = useStore((s) => s.slotsFor);

  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["value"]>("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);

  // booking form
  const [patientId, setPatientId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = React.useState("");
  const [slot, setSlot] = React.useState<string | null>(null);
  const [booking, setBooking] = React.useState(false);
  const [walkInOpen, setWalkInOpen] = React.useState(false);
  const slots = doctorId && date ? slotsFor(doctorId, date) : [];
  React.useEffect(() => setSlot(null), [doctorId, date]);

  const filtered = appointments
    .filter((a) => (filter === "all" ? true : a.status === filter))
    .filter((a) => {
      const p = patients.find((x) => x.id === a.patientId);
      const d = doctors.find((x) => x.id === a.doctorId);
      const hay = `${p?.name} ${d?.name} ${a.reason} ${a.id}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  async function book() {
    if (!patientId || !doctorId || !slot || !reason.trim() || booking) return;
    setBooking(true);
    try {
      // wait for the real API result: on failure the dialog stays open and all
      // entered values are preserved so the user only fixes what's invalid.
      const created = await bookAppointment({ patientId, doctorId, date, time: slot, reason: reason.trim() });
      if (created) {
        setOpen(false);
        setPatientId("");
        setDoctorId("");
        setReason("");
        setSlot(null);
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Hospital-wide booking board."
        actions={
          <>
            <div className="relative">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, doctor…" className="w-56" aria-label="Search appointments" />
            </div>
            <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><TicketPlus /> Walk-in / Emergency token</Button>
              </DialogTrigger>
              <DialogContent title="Walk-in / Emergency token issuer" description="Register patients who arrived without an online appointment." className="max-w-lg">
                <WalkInIssuer
                  doctors={doctors}
                  onIssued={() => {
                    setWalkInOpen(false);
                  }}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="gradient"><CalendarPlus /> New booking</Button>
              </DialogTrigger>
              <DialogContent title="New booking" description="Book on behalf of a patient.">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Patient</Label>
                    <Select value={patientId} onValueChange={setPatientId}>
                      <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      <SelectContent>
                        {patients.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Doctor</Label>
                    <Select value={doctorId} onValueChange={setDoctorId}>
                      <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                      <SelectContent>
                        {doctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name} — {d.specialty}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-date">Date</Label>
                    <Input id="ad-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Slots</Label>
                    {doctorId ? (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {slots.map((s) => (
                          <button
                            key={s.time}
                            disabled={!s.available}
                            onClick={() => setSlot(s.time)}
                            className={
                              "rounded-lg border px-2 py-2 text-xs font-medium tabular-nums transition-all " +
                              (slot === s.time
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : s.available
                                  ? "bg-card hover:border-primary hover:bg-accent"
                                  : "cursor-not-allowed bg-muted text-muted-foreground/50 line-through")
                            }
                          >
                            {s.time}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                        Select a doctor to see open slots
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-reason">Reason</Label>
                    <Input id="ad-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for visit" />
                  </div>
                  <Button variant="gradient" className="w-full" size="lg" disabled={!patientId || !doctorId || !slot || !reason.trim() || booking} onClick={book}>
                    {booking ? "Booking…" : "Confirm booking"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* status filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all " +
              (filter === f.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <EmptyState emoji="📅" title="No appointments match" />}
        {filtered.map((a) => {
          const p = patients.find((x) => x.id === a.patientId)!;
          const d = doctors.find((x) => x.id === a.doctorId)!;
          return (
            <Card key={a.id} className="p-4 transition-all hover:shadow-lift">
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-24">
                  <p className="font-semibold tabular-nums">{dateLabel(a.date)}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{a.time}</p>
                </div>
                <Avatar name={p?.name ?? "?"} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p?.name} <span className="text-muted-foreground">→ {d?.name}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{a.reason} · {d?.department}</p>
                </div>
                <ApptStatus status={a.status} />
                <div className="flex gap-1.5">
                  {a.status === "scheduled" && (
                    <Button size="sm" variant="outline" onClick={() => confirmAppointment(a.id)}>Confirm</Button>
                  )}
                  {(a.status === "confirmed" || a.status === "scheduled") && (
                    <>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => markNoShow(a.id)}>No-show</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelAppointment(a.id)}>Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/**
 * Walk-in / Emergency Token Issuer (staff only).
 *
 * Flow: identity search (Patient ID / phone) → reuse the existing patient or
 * register a genuinely new one (server-issued Patient ID) → issue a queue
 * token against any on-duty doctor for TODAY. Emergency arrivals skip routine
 * registration/payment buffers and are issued an emergency-priority token.
 * Duplicate tokens are prevented server-side (one active entry per
 * patient/doctor/day + idempotency keys).
 */
function WalkInIssuer({ doctors, onIssued }: { doctors: { id: string; name: string; department: string }[]; onIssued: () => void }) {
  const issueQueueToken = useStore((s) => s.issueQueueToken);

  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Patient[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<Patient | null>(null);

  // new-patient fields
  const [npName, setNpName] = React.useState("");
  const [npPhone, setNpPhone] = React.useState("");
  const [npDob, setNpDob] = React.useState("");
  const [npGender, setNpGender] = React.useState("other");

  const [mode, setMode] = React.useState<"walk_in" | "emergency">("walk_in");
  const [doctorId, setDoctorId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{ tokenNo: number; patientName: string; patientCode: string; department: string } | null>(null);

  async function doSearch() {
    setError(null);
    setResults([]);
    if (search.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(search.trim())}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setResults(data.patients ?? []);
      else setError(data.error ?? "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function registerNew(): Promise<Patient | null> {
    setError(null);
    if (!npName.trim() || !npPhone.trim()) {
      setError("Name and phone are required to register a new walk-in patient.");
      return null;
    }
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: npName.trim(), phone: npPhone.trim(), dob: npDob, gender: npGender }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      const p = data.patient as Patient;
      await useStore.getState().refresh();
      setSelected(p);
      return p;
    }
    if (res.status === 409 && data.needsReview) {
      setError(data.message);
      return null;
    }
    if (data.matched && data.patient) {
      setSelected(data.patient as Patient);
      return data.patient as Patient;
    }
    setError(data.error ?? "Registration failed.");
    return null;
  }

  async function issue() {
    if (!selected || !doctorId) {
      setError(!selected ? "Select or register the patient first." : "Choose the doctor's queue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await issueQueueToken({
        doctorId,
        patientId: selected.id,
        source: mode,
        priority: mode === "emergency" ? "emergency" : "normal",
        note: note.trim(),
      });
      if (!r.ok || !r.entry) {
        setError(r.error ?? "Token issuance failed.");
        return;
      }
      setIssued({
        tokenNo: r.entry.tokenNo,
        patientName: selected.name,
        patientCode: (selected as any).patientCode || selected.id,
        department: r.entry.department,
      });
      onIssued();
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-6xl font-black tabular-nums text-primary">#{issued.tokenNo}</p>
        <div>
          <p className="font-semibold">{issued.patientName}</p>
          <p className="font-mono text-xs text-muted-foreground">{issued.patientCode} · {issued.department}</p>
        </div>
        {mode === "emergency" && <Badge variant="destructive">EMERGENCY priority</Badge>}
        <p className="text-xs text-muted-foreground">The token appears immediately in the Doctor Panel's waiting queue and on the waiting-room display.</p>
        <Button variant="outline" className="w-full" onClick={() => window.print()}>
          Print token slip
        </Button>
        <Button
          variant="gradient"
          className="w-full"
          onClick={() => {
            setIssued(null);
            setSelected(null);
            setSearch("");
            setResults([]);
            setNpName("");
            setNpPhone("");
            setNpDob("");
            setNote("");
          }}
        >
          Issue another token
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("walk_in")}
          className={"rounded-lg border px-3 py-2 text-sm font-medium " + (mode === "walk_in" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
        >
          Routine walk-in
        </button>
        <button
          type="button"
          onClick={() => setMode("emergency")}
          className={"flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium " + (mode === "emergency" ? "border-destructive bg-destructive/10 text-destructive" : "hover:bg-muted")}
        >
          <Siren className="size-4" /> Emergency arrival
        </button>
      </div>
      {mode === "emergency" && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Emergency arrivals receive an emergency-priority token immediately — no routine registration fees or payment step before assessment.
        </p>
      )}

      {!selected ? (
        <div className="space-y-3">
          <div>
            <Label>Find existing patient (Patient ID or phone, or name ≥3 chars)</Label>
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PAT-2026-000012 / 98765… / name" />
              <Button size="sm" variant="outline" disabled={searching} onClick={doSearch}>
                {searching ? "…" : "Search"}
              </Button>
            </div>
          </div>
          {results.length > 0 && (
            <div className="space-y-1.5">
              {results.map((p) => (              <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>{p.name} <span className="text-xs text-muted-foreground">{p.phone}</span></span>
                  <span className="font-mono text-xs">{p.patientCode || p.id}</span>
                </button>
              ))}
              <p className="text-[11px] text-muted-foreground">Name-only matches are shown for identification — confirm identity before issuing (never match by name alone).</p>
            </div>
          )}
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Register a new patient</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="Full name *" />
              <Input value={npPhone} onChange={(e) => setNpPhone(e.target.value)} placeholder="Phone *" inputMode="tel" />
              <Input type="date" value={npDob} onChange={(e) => setNpDob(e.target.value)} />
              <Select value={npGender} onValueChange={setNpGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="secondary" className="mt-2 w-full" disabled={busy} onClick={registerNew}>
              Register & Patient ID (server-issued)
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{selected.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{selected.patientCode || selected.id}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Change</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Doctor's queue (today)</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} — {d.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wi-note">Visit reason / triage note</Label>
            <Textarea id="wi-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. arrived at reception with…" />
          </div>
          <Button variant="gradient" className="w-full" size="lg" disabled={busy || !doctorId} onClick={issue}>
            {busy ? "Issuing…" : mode === "emergency" ? "Issue emergency token" : "Issue walk-in token"}
          </Button>
        </>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
