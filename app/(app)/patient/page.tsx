"use client";

import Link from "next/link";
import { CalendarClock, FileHeart, HeartPulse, ReceiptText, Clock3 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, StatCard, EmptyState } from "@/components/ui/primitives";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { greeting, dateLabel, dayLabel, fmtMoney } from "@/lib/utils";

export default function PatientDashboard() {
  const session = useStore((s) => s.session)!;
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const appointments = useStore((s) => s.appointments);
  const prescriptions = useStore((s) => s.prescriptions);
  const invoices = useStore((s) => s.invoices);
  const visits = useStore((s) => s.visits);

  const me = patients.find((p) => p.id === session.patientId)!;
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = appointments
    .filter((a) => a.patientId === me.id && a.date >= today && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const next = upcoming[0];
  const nextDoc = doctors.find((d) => d.id === next?.doctorId);

  const myRx = prescriptions.filter((rx) => rx.patientId === me.id && rx.active);
  const balance = invoices
    .filter((i) => i.patientId === me.id && i.status !== "paid")
    .reduce((s, i) => s + i.items.reduce((x, it) => x + it.amount, 0), 0);
  const lastVisit = visits
    .filter((v) => v.patientId === me.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${me.name.split(" ")[0]} 👋`}
        description="Here's your health at a glance."
      />

      {/* Next appointment hero */}
      {next ? (
        <Card className="overflow-hidden border-0 gradient-primary text-white shadow-lift">
          <CardContent className="flex flex-wrap items-center gap-6 p-6 sm:p-7">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <CalendarClock className="size-8" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/70">Your next appointment</p>
              <p className="mt-0.5 truncate font-display text-xl font-bold">
                {nextDoc?.name} · {nextDoc?.specialty}
              </p>
              <p className="mt-1 text-sm text-white/80">
                {dayLabel(next.date)} · {next.time} · Room {nextDoc?.room} · “{next.reason}”
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/patient/appointments"
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white/15 px-4 text-sm font-medium text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Manage visits
              </Link>
              <Link
                href="/patient/appointments"
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 text-sm font-medium text-teal-900 shadow-sm transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                View details
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-semibold">No upcoming appointments</p>
            <p className="text-sm text-muted-foreground">Book a visit with one of our specialists.</p>
          </div>
          <Button>
            <Link href="/patient/appointments">Book appointment</Link>
          </Button>
        </Card>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active prescriptions"
          value={myRx.length}
          icon={<FileHeart className="size-5" />}
          tone="primary"
          sub={myRx.length ? "Latest: " + dateLabel(myRx[0].date) : "None"}
        />
        <StatCard
          label="Outstanding balance"
          value={fmtMoney(balance)}
          icon={<ReceiptText className="size-5" />}
          tone={balance > 0 ? "warning" : "success"}
          sub={balance > 0 ? "Across unpaid invoices" : "All settled 🎉"}
        />
        <StatCard
          label="Upcoming visits"
          value={upcoming.length}
          icon={<CalendarClock className="size-5" />}
          sub={upcoming.length ? "Next: " + dateLabel(upcoming[0].date) : "None booked"}
        />
        <StatCard
          label="Blood group"
          value={me.bloodGroup}
          icon={<HeartPulse className="size-5" />}
          tone="primary"
          sub={`${me.gender === "female" ? "F" : "M"} · ${age(me.dob)} yrs`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Active prescriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileHeart className="size-4 text-primary" /> Active prescriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myRx.length === 0 && (
              <EmptyState emoji="💊" title="No active prescriptions" description="Prescriptions from your doctors will appear here." />
            )}
            {myRx.slice(0, 3).map((rx) => {
              const doc = doctors.find((d) => d.id === rx.doctorId);
              return (
                <div key={rx.id} className="rounded-xl border p-4 transition-colors hover:bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{rx.items[0].drug}</p>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rx.items[0].dosage} · {rx.items[0].frequency}
                    {rx.items.length > 1 && ` +${rx.items.length - 1} more`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prescribed by {doc?.name} on {dateLabel(rx.date)}
                  </p>
                </div>
              );
            })}
            {myRx.length > 3 && (
              <Link href="/patient/records" className="block text-center text-sm font-medium text-primary hover:underline">
                View all in Health records →
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Last visit + vitals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="size-4 text-primary" /> Last visit summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!lastVisit && (
              <EmptyState emoji="🩺" title="No visits yet" description="Your visit history will appear here after your first appointment." />
            )}
            {lastVisit && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{lastVisit.diagnosis}</p>
                    <p className="text-sm text-muted-foreground">
                      {dateLabel(lastVisit.date)} · {lastVisit.department}
                    </p>
                  </div>
                  <Badge variant="sky">Visit</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { k: "BP", v: lastVisit.vitals.bp },
                    { k: "Heart rate", v: `${lastVisit.vitals.hr} bpm` },
                    { k: "Temp", v: `${lastVisit.vitals.tempC}°C` },
                    { k: "SpO₂", v: `${lastVisit.vitals.spo2}%` },
                  ].map((v) => (
                    <div key={v.k} className="rounded-xl bg-muted/60 p-3 text-center">
                      <p className="text-xs text-muted-foreground">{v.k}</p>
                      <p className="mt-1 font-semibold tabular-nums">{v.v}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-xl bg-secondary/60 p-3 text-sm text-secondary-foreground">
                  <span className="font-medium">Doctor's note: </span>
                  {lastVisit.notes}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function age(dob: string) {
  const d = new Date(dob);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}
