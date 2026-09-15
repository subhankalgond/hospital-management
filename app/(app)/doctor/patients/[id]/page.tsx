"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, ShieldCheck, Pill, Syringe } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ageFrom, dateLabel } from "@/lib/utils";

export default function PatientChart({ params }: { params: { id: string } }) {
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const visits = useStore((s) => s.visits);
  const prescriptions = useStore((s) => s.prescriptions);
  const p = patients.find((x) => x.id === params.id);

  const myVisits = visits
    .filter((v) => v.patientId === params.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myRx = prescriptions
    .filter((rx) => rx.patientId === params.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!p) {
    return (
      <EmptyState
        emoji="🤷"
        title="Patient not found"
        action={<Button variant="outline"><Link href="/doctor/patients">Back to patients</Link></Button>}
      />
    );
  }

  const pdoc = (id: string) => doctors.find((d) => d.id === id)?.name ?? "Unknown";

  return (
    <>
      <Link
        href="/doctor/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All patients
      </Link>

      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="gradient-primary p-6 text-white">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur-sm">
              {p.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold">{p.name}</p>
              <p className="text-sm text-white/75">
                {p.id.toUpperCase()} · {ageFrom(p.dob)} yrs · {p.gender === "female" ? "Female" : "Male"} · Blood {p.bloodGroup}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {p.allergies.map((a) => (
                <span key={a} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
                  ⚠ {a}
                </span>
              ))}
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <p className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" /> {p.phone}</p>
          <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /> {p.email}</p>
          <p className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" /> {p.address}</p>
          <p className="flex items-center gap-2 sm:col-span-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            {p.insurance.provider} · <span className="font-mono">{p.insurance.number}</span>
          </p>
          <p className="text-muted-foreground">
            Emergency: {p.emergencyContact.name} ({p.emergencyContact.relation}) · {p.emergencyContact.phone}
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="visits" className="mt-6">
        <TabsList>
          <TabsTrigger value="visits">Visits ({myVisits.length})</TabsTrigger>
          <TabsTrigger value="rx">Prescriptions ({myRx.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-4">
          {myVisits.length === 0 && <EmptyState emoji="🩺" title="No visits on record" />}
          {myVisits.map((v) => (
            <Card key={v.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{v.diagnosis}</p>
                  <p className="text-sm text-muted-foreground">
                    {dateLabel(v.date)} · {v.department} · seen by {pdoc(v.doctorId)}
                  </p>
                </div>
                <Badge variant="outline">{v.id}</Badge>
              </div>
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
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rx" className="space-y-4">
          {myRx.length === 0 && <EmptyState emoji="💊" title="No prescriptions on record" />}
          {myRx.map((rx) => (
            <Card key={rx.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Pill className="size-5 text-primary" />
                  <p className="font-semibold">{dateLabel(rx.date)}</p>
                  <Badge variant={rx.active ? "success" : "outline"}>{rx.active ? "Active" : "Completed"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">by {pdoc(rx.doctorId)}</p>
              </div>
              <div className="mt-3 space-y-2">
                {rx.items.map((it, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <p className="font-medium">{it.drug}</p>
                    <p className="text-sm text-muted-foreground">
                      {it.dosage} · {it.frequency} · {it.durationDays} days
                      {it.instructions ? ` — ${it.instructions}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
