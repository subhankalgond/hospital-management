"use client";

import * as React from "react";
import { CalendarPlus, Clock, MapPin, Search, Stethoscope, GraduationCap } from "lucide-react";
import { useStore, type Slot } from "@/lib/store";
import type { Appointment, Doctor } from "@/lib/types";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Badge,
  Input,
  Label,
} from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { dayLabel, dateLabel } from "@/lib/utils";
import { DEPARTMENT_NAMES } from "@/lib/defaults";

const REASONS = [
  "General consultation",
  "Follow-up visit",
  "New symptom",
  "Prescription refill",
  "Second opinion",
  "Lab results review",
];

export default function PatientAppointments() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const appointments = useStore((s) => s.appointments);
  const book = useStore((s) => s.bookAppointment);
  const cancel = useStore((s) => s.cancelAppointment);
  const slotsFor = useStore((s) => s.slotsFor);

  const today = new Date().toISOString().slice(0, 10);
  const mine = appointments.filter((a) => a.patientId === session.patientId);
  const upcoming = mine
    .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = mine
    .filter((a) => !(a.date >= today && a.status !== "cancelled" && a.status !== "completed"))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  // booking form state
  const [open, setOpen] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState("");
  const [date, setDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = React.useState("");
  const [slot, setSlot] = React.useState<string | null>(null);

  // doctor browser filters
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [q, setQ] = React.useState("");

  const visibleDoctors = doctors
    .filter((d) => (deptFilter === "all" ? true : d.department === deptFilter))
    .filter((d) => `${d.name} ${d.specialty} ${d.department}`.toLowerCase().includes(q.toLowerCase()));

  const slots = doctorId && date ? slotsFor(doctorId, date) : [];
  const canBook = doctorId && reason.trim() && slot;

  React.useEffect(() => setSlot(null), [doctorId, date]);

  function submit() {
    if (!canBook) return;
    const ok = book({
      patientId: session.patientId!,
      doctorId,
      date,
      time: slot!,
      reason: reason.trim(),
    });
    if (ok) {
      setOpen(false);
      setDoctorId("");
      setReason("");
      setSlot(null);
      setQ("");
      setDeptFilter("all");
    }
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Book, reschedule or review your visits."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient">
                <CalendarPlus /> Book appointment
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Book an appointment"
              description="Choose from doctors registered on CarePulse."
              className="max-w-xl"
            >
              {doctors.length === 0 ? (
                <div className="py-4">
                  <EmptyState
                    emoji="🩺"
                    title="No doctors have signed up yet"
                    description="As soon as a doctor registers, they'll appear here and you can book them."
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* doctor browser */}
                  <div className="space-y-2">
                    <Label>Doctor *</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search name or specialty…"
                          className="pl-9"
                          aria-label="Search doctors"
                        />
                      </div>
                      <Select value={deptFilter} onValueChange={setDeptFilter}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All departments</SelectItem>
                          {DEPARTMENT_NAMES.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                      {visibleDoctors.length === 0 && (
                        <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                          No doctors match your search.
                        </p>
                      )}
                      {visibleDoctors.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDoctorId(d.id)}
                          className={
                            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all " +
                            (doctorId === d.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                              : "bg-card hover:border-primary/40 hover:bg-accent/50")
                          }
                        >
                          <span className="rounded-lg bg-primary/10 p-2 text-primary">
                            <Stethoscope className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-semibold">{d.name}</span>
                              {d.onCall && <Badge variant="success">On call</Badge>}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {d.specialty} · {d.department} · {d.experienceYears}y
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {doctorId && (
                      <p className="text-xs text-muted-foreground">
                        Selected: <span className="font-medium text-foreground">{doctors.find((d) => d.id === doctorId)?.name}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="appt-date">Date</Label>
                    <Input
                      id="appt-date"
                      type="date"
                      value={date}
                      min={today}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Available slots</Label>
                    {doctorId ? (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {slots.map((s: Slot) => (
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
                    <Label htmlFor="appt-reason">Reason for visit</Label>
                    <Input
                      id="appt-reason"
                      placeholder="e.g. chest discomfort during exercise"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(r)}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button variant="gradient" className="w-full" size="lg" disabled={!canBook} onClick={submit}>
                    Confirm booking
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">History ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          {upcoming.length === 0 && (
            <EmptyState
              emoji="📅"
              title="Nothing booked yet"
              description="Your upcoming appointments will show up here."
              action={<Button onClick={() => setOpen(true)}>Book appointment</Button>}
            />
          )}
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} appt={a} onCancel={() => cancel(a.id)} />
          ))}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          {past.length === 0 && <EmptyState emoji="🗂" title="No past appointments" />}
          {past.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}

function AppointmentCard({ appt, onCancel }: { appt: Appointment; onCancel?: () => void }) {
  const doctors = useStore((s) => s.doctors);
  const reschedule = useStore((s) => s.rescheduleAppointment);
  const [reschedOpen, setReschedOpen] = React.useState(false);
  const [date, setDate] = React.useState(appt.date);
  const [time, setTime] = React.useState(appt.time);
  const doc = doctors.find((d) => d.id === appt.doctorId);
  const isActive = appt.status !== "cancelled" && appt.status !== "completed";

  return (
    <Card className="p-5 transition-all hover:shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex flex-col items-center rounded-xl bg-primary/10 px-3 py-2 text-primary">
            <Stethoscope className="size-5" />
            <span className="mt-1 text-[11px] font-semibold">{doc?.department}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{doc?.name ?? "Doctor no longer listed"}</p>
            <p className="text-sm text-muted-foreground">
              {appt.reason}
              {doc?.room && doc.room !== "—" ? ` · Room ${doc.room}` : ""}
            </p>
            {doc && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="size-3.5" /> {doc.qualification} · {doc.experienceYears}y experience
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" /> {dateLabel(appt.date)} · {appt.time}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> {dayLabel(appt.date)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ApptStatus status={appt.status} />
          {isActive && onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {isActive && (
            <Dialog open={reschedOpen} onOpenChange={setReschedOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                  Reschedule
                </Button>
              </DialogTrigger>
              <DialogContent title="Reschedule appointment" description={`With ${doc?.name ?? "doctor"}`}>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="rs-date">New date</Label>
                    <Input id="rs-date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rs-time">New time</Label>
                    <Select value={time} onValueChange={setTime}>
                      <SelectTrigger id="rs-time">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(doc ? useStore.getState().slotsFor(doc.id, date) : []).map((s) => (
                          <SelectItem key={s.time} value={s.time} disabled={!s.available && s.time !== appt.time}>
                            {s.time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="gradient"
                    className="w-full"
                    onClick={() => {
                      reschedule(appt.id, date, time);
                      setReschedOpen(false);
                    }}
                  >
                    Confirm new time
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </Card>
  );
}
