"use client";

import * as React from "react";
import { Pill, Syringe, TriangleAlert, Waves, FileText } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";

export default function PatientRecords() {
  const session = useStore((s) => s.session)!;
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const visits = useStore((s) => s.visits);
  const prescriptions = useStore((s) => s.prescriptions);

  const me = patients.find((p) => p.id === session.patientId)!;
  const myVisits = visits
    .filter((v) => v.patientId === me.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myRx = prescriptions
    .filter((rx) => rx.patientId === me.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHeader title="Health records" description="Your medical history, prescriptions and personal health flags." />

      {/* Alert flags */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-5" />
            <p className="font-semibold">Allergies</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {me.allergies.length ? (
              me.allergies.map((a) => <Badge key={a} variant="destructive">{a}</Badge>)
            ) : (
              <p className="text-sm text-muted-foreground">None recorded</p>
            )}
          </div>
        </Card>
        <Card className="border-warning/30 bg-warning/5 p-5">
          <div className="flex items-center gap-2 text-warning">
            <Waves className="size-5" />
            <p className="font-semibold">Chronic conditions</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {me.conditions.length ? (
              me.conditions.map((c) => <Badge key={c} variant="warning">{c}</Badge>)
            ) : (
              <p className="text-sm text-muted-foreground">None recorded</p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-primary">
            <Syringe className="size-5" />
            <p className="font-semibold">Immunizations</p>
          </div>
          <div className="mt-3 space-y-1.5">
            {me.immunizations.map((im) => (
              <div key={im.name} className="flex items-center justify-between text-sm">
                <span>{im.name}</span>
                <span className="text-muted-foreground">{dateLabel(im.date)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="visits" className="mt-6">
        <TabsList>
          <TabsTrigger value="visits">Visit history ({myVisits.length})</TabsTrigger>
          <TabsTrigger value="rx">Prescriptions ({myRx.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-4">
          {myVisits.length === 0 && <EmptyState emoji="🩺" title="No visits recorded yet" />}
          {myVisits.map((v) => {
            const doc = doctors.find((d) => d.id === v.doctorId);
            return (
              <Card key={v.id} className="overflow-hidden">
                <div className="flex flex-col gap-4 p-5 sm:flex-row">
                  {/* timeline rail */}
                  <div className="flex flex-row items-center gap-3 sm:w-40 sm:flex-col sm:items-start">
                    <div className="rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
                      {dateLabel(v.date)}
                    </div>
                    <Badge variant="outline">{v.department}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{v.diagnosis}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">Seen by {doc?.name}</p>
                    <p className="mt-2 text-sm">{v.notes}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[
                        { k: "BP", v: v.vitals.bp },
                        { k: "HR", v: `${v.vitals.hr} bpm` },
                        { k: "Temp", v: `${v.vitals.tempC}°C` },
                        { k: "SpO₂", v: `${v.vitals.spo2}%` },
                        { k: "Weight", v: `${v.vitals.weightKg} kg` },
                      ].map((x) => (
                        <div key={x.k} className="rounded-lg bg-muted/60 px-2.5 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{x.k}</p>
                          <p className="text-sm font-semibold tabular-nums">{x.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="rx" className="space-y-4">
          {myRx.length === 0 && <EmptyState emoji="💊" title="No prescriptions on file" />}
          {myRx.map((rx) => {
            const doc = doctors.find((d) => d.id === rx.doctorId);
            return (
              <Card key={rx.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pill className="size-5 text-primary" />
                    <p className="font-semibold">{dateLabel(rx.date)}</p>
                    <Badge variant={rx.active ? "success" : "outline"}>
                      {rx.active ? "Active" : "Completed"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">by {doc?.name}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {rx.items.map((it, idx) => (
                    <div key={idx} className="rounded-xl border p-3">
                      <p className="font-medium">{it.drug}</p>
                      <p className="text-sm text-muted-foreground">
                        {it.dosage} · {it.frequency} · {it.durationDays} days
                        {it.instructions ? ` — ${it.instructions}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </>
  );
}
