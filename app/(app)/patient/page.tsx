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

  const me = patients.find((p) => p.id === session.patientId);
  const today = new Date().toISOString().slice(0, 10);

  if (!me) {
    return (
      <>
        <PageHeader title="Welcome" />
        <Card className="p-10 text-center text-muted-foreground">Profile not found.</Card>
      </>
    );
  }

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
        kicker="Patient Portal"
        title={`${greeting()}, ${me.name.split(" ")[0]}`}
        description="Your clinical profile, upcoming visits, active prescriptions, and billing summary."
      />

      {/* Next appointment hero */}
      {next ? (
        <Card className="overflow-hidden border border-[#173D35] bg-[#173D35] text-[#F7F5F0] shadow-paper">
          <CardContent className="flex flex-wrap items-center gap-6 p-6 sm:p-7">
            <div className="rounded border border-[#F7F5F0]/20 bg-white/10 p-3.5 text-[#F7F5F0]">
              <CalendarClock className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="uppercase text-[11px] font-semibold tracking-wider text-[#F7F5F0]/70">Upcoming Clinical Appointment</p>
              <p className="mt-1 truncate font-serif text-2xl font-normal text-[#F7F5F0]">
                {nextDoc?.name} · {nextDoc?.specialty}
              </p>
              <p className="mt-1 text-xs text-[#F7F5F0]/80">
                {dayLabel(next.date)} · {next.time} · Room {nextDoc?.room} · “{next.reason}”
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/patient/appointments"
                className="inline-flex h-9 items-center justify-center gap-2 rounded border border-[#F7F5F0]/30 bg-transparent px-4 text-xs font-semibold uppercase tracking-wider text-[#F7F5F0] transition-colors hover:bg-white/10"
              >
                Manage Visits
              </Link>
              <Link
                href="/patient/appointments"
                className="inline-flex h-9 items-center justify-center gap-2 rounded bg-[#F7F5F0] px-4 text-xs font-semibold uppercase tracking-wider text-[#173D35] transition-colors hover:bg-white"
              >
                View Details
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-serif text-lg font-normal text-foreground">No upcoming appointments</p>
            <p className="text-xs text-muted-foreground">Schedule a consultation with one of our medical specialists.</p>
          </div>
          <Button>
            <Link href="/patient/appointments">Book Appointment</Link>
          </Button>
        </Card>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Prescriptions"
          value={myRx.length}
          icon={<FileHeart className="size-4" />}
          tone="primary"
          sub={myRx.length ? "Latest: " + dateLabel(myRx[0].date) : "None active"}
        />
        <StatCard
          label="Outstanding Balance"
          value={fmtMoney(balance)}
          icon={<ReceiptText className="size-4" />}
          tone={balance > 0 ? "warning" : "success"}
          sub={balance > 0 ? "Across unpaid invoices" : "All invoices settled"}
        />
        <StatCard
          label="Upcoming Visits"
          value={upcoming.length}
          icon={<CalendarClock className="size-4" />}
          sub={upcoming.length ? "Next: " + dateLabel(upcoming[0].date) : "None scheduled"}
        />
        <StatCard
          label="Blood Group"
          value={me.bloodGroup}
          icon={<HeartPulse className="size-4" />}
          tone="primary"
          sub={`${me.gender === "female" ? "Female" : "Male"} · ${age(me.dob)} yrs`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Active prescriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileHeart className="size-4 text-primary" /> Active Prescriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 pt-2">
            {myRx.length === 0 && (
              <EmptyState emoji="💊" title="No active prescriptions" description="Prescriptions from your doctors will appear here." />
            )}
            {myRx.slice(0, 3).map((rx) => {
              const doc = doctors.find((d) => d.id === rx.doctorId);
              return (
                <div key={rx.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-serif text-base font-normal text-foreground">{rx.items[0].drug}</p>
                    <Badge variant="success">Active</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rx.items[0].dosage} · {rx.items[0].frequency}
                    {rx.items.length > 1 && ` +${rx.items.length - 1} more`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Prescribed by {doc?.name} on {dateLabel(rx.date)}
                  </p>
                </div>
              );
            })}
            {myRx.length > 3 && (
              <div className="pt-3">
                <Link href="/patient/records" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
                  View all in Health records →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last visit + vitals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="size-4 text-primary" /> Last Visit Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {!lastVisit && (
              <EmptyState emoji="🩺" title="No visits yet" description="Your visit history will appear here after your first appointment." />
            )}
            {lastVisit && (
              <>
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div>
                    <p className="font-serif text-base font-normal text-foreground">{lastVisit.diagnosis}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel(lastVisit.date)} · {lastVisit.department}
                    </p>
                  </div>
                  <Badge variant="sky">Visit Record</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { k: "Blood Pressure", v: lastVisit.vitals.bp },
                    { k: "Heart Rate", v: `${lastVisit.vitals.hr} bpm` },
                    { k: "Temperature", v: `${lastVisit.vitals.tempC}°C` },
                    { k: "SpO₂ Saturation", v: `${lastVisit.vitals.spo2}%` },
                  ].map((v) => (
                    <div key={v.k} className="rounded border border-border/60 bg-muted/30 p-2.5 text-center">
                      <p className="uppercase text-[10px] font-semibold tracking-wider text-muted-foreground">{v.k}</p>
                      <p className="mt-1 font-serif text-base font-normal tabular-nums text-foreground">{v.v}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded border border-border/60 bg-secondary/50 p-3 text-xs text-foreground leading-relaxed">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground block mb-0.5">Doctor's Note</span>
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
