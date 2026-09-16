"use client";

import * as React from "react";
import { Mail, MapPin, Phone, ShieldCheck, UserRound, HeartHandshake, Droplets, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Patient } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui/primitives";
import { Dialog, DialogContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel, ageFrom } from "@/lib/utils";
import { BLOOD_GROUPS } from "@/lib/defaults";

export default function PatientProfile() {
  const session = useStore((s) => s.session)!;
  const patients = useStore((s) => s.patients);
  const me = patients.find((p) => p.id === session.patientId);
  const [editOpen, setEditOpen] = React.useState(false);

  if (!me) {
    return (
      <>
        <PageHeader title="Profile" />
        <Card className="p-10 text-center text-muted-foreground">Profile not found.</Card>
      </>
    );
  }

  const unknown = (v: string) => !v?.trim();

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your personal and insurance details."
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil /> Edit profile
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="gradient-primary p-6 text-white sm:p-7">
          <div className="flex items-center gap-4">
            <Avatar name={me.name} className="size-16 rounded-2xl bg-white/15 text-xl text-white backdrop-blur-sm" />
            <div>
              <p className="font-display text-2xl font-bold">{me.name}</p>
              <p className="text-sm text-white/75">
                Patient ID {me.id.toUpperCase()} · {me.gender === "female" ? "Female" : me.gender === "male" ? "Male" : "Other"}
                {me.dob ? ` · ${ageFrom(me.dob)} yrs` : ""}
              </p>
            </div>
            {me.bloodGroup && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm">
                <Droplets className="size-4" /> {me.bloodGroup}
              </span>
            )}
          </div>
        </div>

        <CardContent className="grid gap-6 p-6 md:grid-cols-2">
          <section>
            <CardTitle className="mb-3 flex items-center gap-2 text-base">
              <UserRound className="size-4 text-primary" /> Contact information
            </CardTitle>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5"><Mail className="size-4 text-muted-foreground" /> {me.email}</li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 text-muted-foreground" /> {unknown(me.phone) ? <em className="text-muted-foreground">Not added yet</em> : me.phone}
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                {unknown(me.address) ? <em className="text-muted-foreground">Not added yet</em> : me.address}
              </li>
            </ul>
            <CardTitle className="mb-3 mt-6 flex items-center gap-2 text-base">
              <HeartHandshake className="size-4 text-primary" /> Emergency contact
            </CardTitle>
            {unknown(me.emergencyContact.name) ? (
              <p className="text-sm text-muted-foreground">Not added yet — add one so we know who to call.</p>
            ) : (
              <p className="text-sm">
                {me.emergencyContact.name} <span className="text-muted-foreground">({me.emergencyContact.relation})</span>
                <br />
                <span className="text-muted-foreground">{me.emergencyContact.phone}</span>
              </p>
            )}
          </section>

          <section>
            <CardTitle className="mb-3 flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" /> Insurance
            </CardTitle>
            <div className="rounded-2xl border bg-muted/40 p-4">
              {unknown(me.insurance.provider) ? (
                <p className="text-sm text-muted-foreground">
                  No insurance on file — care is billed as self-pay.
                </p>
              ) : (
                <>
                  <p className="font-semibold">{me.insurance.provider}</p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">{me.insurance.number}</p>
                  <Badge variant="success" className="mt-3">Coverage active</Badge>
                </>
              )}
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

      {me.immunizations.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Immunizations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {me.immunizations.map((im) => (
              <div key={im.name} className="flex items-center justify-between text-sm">
                <span>{im.name}</span>
                <span className="text-muted-foreground">{dateLabel(im.date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} patient={me} />
    </>
  );
}

function EditProfileDialog({
  open,
  onOpenChange,
  patient,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: Patient;
}) {
  const update = useStore((s) => s.updatePatientProfile);

  const [phone, setPhone] = React.useState(patient.phone);
  const [address, setAddress] = React.useState(patient.address);
  const [bloodGroup, setBloodGroup] = React.useState(patient.bloodGroup || "none");
  const [insuranceProvider, setInsuranceProvider] = React.useState(patient.insurance.provider);
  const [insuranceNumber, setInsuranceNumber] = React.useState(patient.insurance.number);
  const [ecName, setEcName] = React.useState(patient.emergencyContact.name);
  const [ecPhone, setEcPhone] = React.useState(patient.emergencyContact.phone);
  const [ecRelation, setEcRelation] = React.useState(patient.emergencyContact.relation);
  const [allergies, setAllergies] = React.useState(patient.allergies.join(", "));
  const [conditions, setConditions] = React.useState(patient.conditions.join(", "));

  React.useEffect(() => {
    if (open) {
      setPhone(patient.phone);
      setAddress(patient.address);
      setBloodGroup(patient.bloodGroup || "none");
      setInsuranceProvider(patient.insurance.provider);
      setInsuranceNumber(patient.insurance.number);
      setEcName(patient.emergencyContact.name);
      setEcPhone(patient.emergencyContact.phone);
      setEcRelation(patient.emergencyContact.relation);
      setAllergies(patient.allergies.join(", "));
      setConditions(patient.conditions.join(", "));
    }
  }, [open, patient]);

  function save() {
    const splitList = (s: string) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    update(patient.id, {
      phone: phone.trim(),
      address: address.trim(),
      bloodGroup: bloodGroup === "none" ? "" : bloodGroup,
      insurance: { provider: insuranceProvider.trim(), number: insuranceNumber.trim() },
      emergencyContact: { name: ecName.trim(), phone: ecPhone.trim(), relation: ecRelation.trim() },
      allergies: splitList(allergies),
      conditions: splitList(conditions),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit profile" description="Update your contact and health details." className="max-w-xl">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ep-phone">Phone</Label>
              <Input id="ep-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Blood group</Label>
              <Select value={bloodGroup} onValueChange={setBloodGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {BLOOD_GROUPS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ep-address">Address</Label>
            <Input id="ep-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ep-ins">Insurance provider</Label>
              <Input id="ep-ins" value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} placeholder="e.g. BlueShield Plus" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-insno">Policy number</Label>
              <Input id="ep-insno" value={insuranceNumber} onChange={(e) => setInsuranceNumber(e.target.value)} placeholder="e.g. BSP-88412-09" />
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-3 text-sm font-semibold">Emergency contact</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Name" aria-label="Emergency contact name" />
              <Input value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} placeholder="Relation" aria-label="Emergency contact relation" />
              <Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="Phone" aria-label="Emergency contact phone" />
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-3 text-sm font-semibold">Health flags</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ep-allergies">Allergies (comma separated)</Label>
                <Input id="ep-allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, Latex" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-conditions">Chronic conditions (comma separated)</Label>
                <Input id="ep-conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Asthma, Hypertension" />
              </div>
            </div>
          </div>

          <Button variant="gradient" className="w-full" size="lg" onClick={save}>
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
