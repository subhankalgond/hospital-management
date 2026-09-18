"use client";

import * as React from "react";
import { CalendarOff, CalendarPlus, Loader2, PlaneTakeoff, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, Input, Label, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlays";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { addDays, dateLabel, todayISO } from "@/lib/utils";

export default function DoctorSchedule() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const patients = useStore((s) => s.patients);
  const appointments = useStore((s) => s.appointments);
  const leaves = useStore((s) => s.leaves);
  const isDoctorOnLeave = useStore((s) => s.isDoctorOnLeave);
  const cancelLeave = useStore((s) => s.cancelLeave);
  const me = doctors.find((d) => d.id === session.doctorId);

  if (!me) {
    return (
      <>
        <PageHeader title="My schedule" />
        <EmptyState emoji="🗓" title="Doctor profile not found" description="Your account exists but has no linked doctor profile." />
      </>
    );
  }

  // week starts Monday
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = addDays(new Date().toISOString().slice(0, 10), -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayISO();

  const myLeaves = leaves
    .filter((l) => l.doctorId === me.id && l.status === "approved" && l.toDate >= today)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  return (
    <>
      <PageHeader
        title="My schedule"
        description={`${me.specialty} · ${me.department} · Room ${me.room} · ${me.shift} shift`}
        actions={<RequestLeaveDialog />}
      />

      {myLeaves.some((l) => l.fromDate <= today && today <= l.toDate) && (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">You are on approved leave today.</span>{" "}
          <span className="text-muted-foreground">Patients cannot book you until it ends.</span>
        </div>
      )}

      {myLeaves.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="size-4 text-warning" /> Upcoming leaves
            </CardTitle>
          </CardHeader>
          <div className="space-y-2 px-4 pb-4">
            {myLeaves.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {dateLabel(l.fromDate)} → {dateLabel(l.toDate)}
                    {l.fromDate <= today && today <= l.toDate && (
                      <Badge variant="warning" className="ml-2">On leave now</Badge>
                    )}
                  </p>
                  {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
                </div>
                {l.fromDate > today && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => cancelLeave(l.id)}>
                    <Trash2 /> Cancel leave
                  </Button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Leave must be requested at least one day before it starts — patients can always book you for today.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {week.map((day) => {
          const appts = appointments
            .filter((a) => a.doctorId === me.id && a.date === day && a.status !== "cancelled")
            .sort((a, b) => a.time.localeCompare(b.time));
          const isToday = day === today;
          const onLeave = isDoctorOnLeave(me.id, day);
          return (
            <Card
              key={day}
              className={onLeave ? "border-warning/40 bg-warning/5" : isToday ? "ring-2 ring-primary/50" : ""}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{dateLabel(day)}</span>
                  {onLeave ? <Badge variant="warning">On leave</Badge> : isToday && <Badge>Today</Badge>}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {onLeave ? "Not accepting appointments" : `${appts.length} appointment${appts.length === 1 ? "" : "s"}`}
                </p>
              </CardHeader>
              <div className="space-y-2 px-4 pb-4">
                {onLeave && (
                  <p className="rounded-lg bg-warning/10 px-3 py-4 text-center text-xs font-medium text-warning">
                    🏖 Leave day — slots blocked
                  </p>
                )}
                {!onLeave && appts.length === 0 && (
                  <p className="rounded-lg bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                    No appointments
                  </p>
                )}
                {appts.map((a) => {
                  const p = patients.find((x) => x.id === a.patientId);
                  return (
                    <div key={a.id} className="rounded-xl border p-3 transition-colors hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums">{a.time}</span>
                        <ApptStatus status={a.status} />
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{p?.name ?? "Unknown patient"}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ─────────────── request-leave dialog ─────────────── */

function RequestLeaveDialog() {
  const requestLeave = useStore((s) => s.requestLeave);
  const appointments = useStore((s) => s.appointments);
  const session = useStore((s) => s.session)!;

  const [open, setOpen] = React.useState(false);
  const [fromDate, setFromDate] = React.useState(() => addDays(todayISO(), 1));
  const [toDate, setToDate] = React.useState(() => addDays(todayISO(), 1));
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const earliest = addDays(todayISO(), 1);
  const affected = React.useMemo(() => {
    if (!session.doctorId) return 0;
    return appointments.filter(
      (a) =>
        a.doctorId === session.doctorId &&
        a.status !== "cancelled" &&
        a.date >= fromDate &&
        a.date <= toDate
    ).length;
  }, [appointments, fromDate, toDate, session.doctorId]);

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      setError("Please pick both dates.");
      return;
    }
    if (toDate < fromDate) {
      setError("The end date cannot be before the start date.");
      return;
    }
    setBusy(true);
    const res = await requestLeave({ doctorId: session.doctorId!, fromDate, toDate, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not request leave.");
      return;
    }
    setOpen(false);
    setReason("");
    setFromDate(addDays(todayISO(), 1));
    setToDate(addDays(todayISO(), 1));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PlaneTakeoff /> Request leave
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Request leave"
        description="Blocks new bookings for these days. Starts tomorrow at the earliest."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-from">From *</Label>
              <Input
                id="leave-from"
                type="date"
                min={earliest}
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (e.target.value > toDate) setToDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-to">To *</Label>
              <Input id="leave-to" type="date" min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-reason">Reason (optional)</Label>
            <Textarea
              id="leave-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family function, medical conference…"
            />
          </div>

          {fromDate && toDate && fromDate <= toDate && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {affected > 0
                ? `⚠ ${affected} existing appointment${affected === 1 ? "" : "s"} fall${affected === 1 ? "s" : ""} inside this range — they stay booked; only NEW bookings are blocked. Consider asking patients to reschedule.`
                : "No existing appointments fall inside this range."}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button variant="gradient" className="w-full" size="lg" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Confirm leave
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Leave starts <span className="font-medium text-foreground">tomorrow or later</span> — today stays bookable.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
