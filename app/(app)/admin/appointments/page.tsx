"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import type { AppointmentStatus } from "@/lib/types";
import { Avatar, Badge, Button, Card, EmptyState, Input, Label } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { dateLabel, fmtMoney } from "@/lib/utils";

const FILTERS: { value: AppointmentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
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

  function book() {
    if (!patientId || !doctorId || !slot || !reason.trim()) return;
    bookAppointment({ patientId, doctorId, date, time: slot, reason: reason.trim() });
    setOpen(false);
    setPatientId("");
    setDoctorId("");
    setReason("");
    setSlot(null);
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
                  <Button variant="gradient" className="w-full" size="lg" disabled={!patientId || !doctorId || !slot || !reason.trim()} onClick={book}>
                    Confirm booking
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
