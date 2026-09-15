"use client";

import { Mail, MapPin, Phone, ShieldCheck, UserRound, HeartHandshake, Droplets } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel, ageFrom } from "@/lib/utils";

export default function PatientProfile() {
  const session = useStore((s) => s.session)!;
  const patients = useStore((s) => s.patients);
  const me = patients.find((p) => p.id === session.patientId)!;

  return (
    <>
      <PageHeader title="Profile" description="Your personal and insurance details." />

      <Card className="overflow-hidden">
        <div className="gradient-primary p-6 text-white sm:p-7">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold backdrop-blur-sm">
              {me.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
            <div>
              <p className="font-display text-2xl font-bold">{me.name}</p>
              <p className="text-sm text-white/75">
                Patient ID {me.id.toUpperCase()} · {me.gender === "female" ? "Female" : "Male"} · {ageFrom(me.dob)} yrs
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm">
              <Droplets className="size-4" /> {me.bloodGroup}
            </span>
          </div>
        </div>

        <CardContent className="grid gap-6 p-6 md:grid-cols-2">
          <section>
            <CardTitle className="mb-3 flex items-center gap-2 text-base">
              <UserRound className="size-4 text-primary" /> Contact information
            </CardTitle>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5"><Mail className="size-4 text-muted-foreground" /> {me.email}</li>
              <li className="flex items-center gap-2.5"><Phone className="size-4 text-muted-foreground" /> {me.phone}</li>
              <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 text-muted-foreground" /> {me.address}</li>
            </ul>
            <CardTitle className="mb-3 mt-6 flex items-center gap-2 text-base">
              <HeartHandshake className="size-4 text-primary" /> Emergency contact
            </CardTitle>
            <p className="text-sm">
              {me.emergencyContact.name} <span className="text-muted-foreground">({me.emergencyContact.relation})</span>
              <br />
              <span className="text-muted-foreground">{me.emergencyContact.phone}</span>
            </p>
          </section>

          <section>
            <CardTitle className="mb-3 flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" /> Insurance
            </CardTitle>
            <div className="rounded-2xl border bg-muted/40 p-4">
              <p className="font-semibold">{me.insurance.provider}</p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{me.insurance.number}</p>
              <Badge variant="success" className="mt-3">Coverage active</Badge>
            </div>
            <CardTitle className="mb-3 mt-6 flex items-center gap-2 text-base">
              <Droplets className="size-4 text-primary" /> Health flags
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {me.allergies.map((a) => <Badge key={a} variant="destructive">Allergy: {a}</Badge>)}
              {me.conditions.map((c) => <Badge key={c} variant="warning">{c}</Badge>)}
              {me.allergies.length === 0 && me.conditions.length === 0 && (
                <p className="text-sm text-muted-foreground">No flags on file</p>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
    </>
  );
}
