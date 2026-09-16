"use client";

import * as React from "react";
import { Phone, Star, ToggleLeft, ToggleRight, Users, GraduationCap, BadgeCheck } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, dateLabel } from "@/lib/utils";

const shiftBadge = { morning: "secondary", evening: "sky", night: "violet" } as const;

export default function AdminStaff() {
  const doctors = useStore((s) => s.doctors);
  const accounts = useStore((s) => s.accounts);
  const setDoctorOnCall = useStore((s) => s.setDoctorOnCall);
  const appointments = useStore((s) => s.appointments);

  const patients = accounts.filter((a) => a.role === "patient");
  const doctorAccounts = accounts.filter((a) => a.role === "doctor");
  const adminAccounts = accounts.filter((a) => a.role === "admin");

  return (
    <>
      <PageHeader
        title="Staff & doctors"
        description="Registered clinicians and every account on this CarePulse instance."
      />

      <Tabs defaultValue="doctors">
        <TabsList>
          <TabsTrigger value="doctors">Doctors ({doctors.length})</TabsTrigger>
          <TabsTrigger value="accounts">Registered accounts ({accounts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {doctors.length === 0 && (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState
                emoji="🩺"
                title="No doctors have registered yet"
                description="Doctors appear here the moment they create an account with their qualifications."
              />
            </div>
          )}
          {doctors.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={d.name} className="size-12 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.name}</p>
                  <p className="text-sm text-muted-foreground">{d.specialty}</p>
                </div>
                <button
                  onClick={() => setDoctorOnCall(d.id, !d.onCall)}
                  aria-label={`Toggle on-call for ${d.name}`}
                  className={cn("transition-colors", d.onCall ? "text-success" : "text-muted-foreground/40")}
                >
                  {d.onCall ? <ToggleRight className="size-7" /> : <ToggleLeft className="size-7" />}
                </button>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <GraduationCap className="mt-0.5 size-3.5 shrink-0" />
                {d.qualification} · License {d.licenseNo}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant={shiftBadge[d.shift]}>Shift: {d.shift}</Badge>
                {d.room !== "—" && <Badge variant="outline">Room {d.room}</Badge>}
                {d.onCall && <Badge variant="success">On call</Badge>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {d.phone}</span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5" /> {d.experienceYears}y experience
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {appointments.filter((a) => a.doctorId === d.id && a.status !== "cancelled").length} total appointments
              </p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-primary" /> Every account on this instance
              </CardTitle>
            </CardHeader>
            {accounts.length === 0 ? (
              <div className="px-6 pb-8">
                <EmptyState emoji="👥" title="No accounts yet" description="Sign-ups will show up here in real time." />
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Joined</th>
                      <th className="px-6 py-3 font-medium text-right">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => {
                      const profileId = a.patientId ?? a.doctorId;
                      return (
                        <tr key={a.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <Avatar name={a.name} className="size-8 text-xs" />
                              <span className="font-medium">{a.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{a.email}</td>
                          <td className="px-6 py-3.5">
                            <Badge variant={a.role === "admin" ? "violet" : a.role === "doctor" ? "sky" : "default"}>
                              <span className="capitalize">{a.role}</span>
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{dateLabel(a.createdAt)}</td>
                          <td className="px-6 py-3.5 text-right font-mono text-xs text-muted-foreground">
                            {profileId?.toUpperCase() ?? a.id}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t px-6 py-3 text-xs text-muted-foreground">
                  {patients.length} patient{patients.length === 1 ? "" : "s"} · {doctorAccounts.length} doctor
                  {doctorAccounts.length === 1 ? "" : "s"} · {adminAccounts.length} admin
                  {adminAccounts.length === 1 ? "" : "s"} <BadgeCheck className="ml-1 inline size-3.5 text-success" />
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
