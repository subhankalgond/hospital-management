"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Badge, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { PageHeader, ApptStatus } from "@/components/ui/misc";
import { addDays, dateLabel } from "@/lib/utils";

export default function DoctorSchedule() {
  const session = useStore((s) => s.session)!;
  const doctors = useStore((s) => s.doctors);
  const patients = useStore((s) => s.patients);
  const appointments = useStore((s) => s.appointments);
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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="My schedule"
        description={`${me.specialty} · ${me.department} · Room ${me.room} · ${me.shift} shift`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {week.map((day) => {
          const appts = appointments
            .filter((a) => a.doctorId === me.id && a.date === day && a.status !== "cancelled")
            .sort((a, b) => a.time.localeCompare(b.time));
          const isToday = day === today;
          return (
            <Card
              key={day}
              className={isToday ? "ring-2 ring-primary/50" : ""}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{dateLabel(day)}</span>
                  {isToday && <Badge>Today</Badge>}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {appts.length} appointment{appts.length === 1 ? "" : "s"}
                </p>
              </CardHeader>
              <div className="space-y-2 px-4 pb-4">
                {appts.length === 0 && (
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
