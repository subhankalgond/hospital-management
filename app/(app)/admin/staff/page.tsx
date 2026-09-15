"use client";

import * as React from "react";
import { Phone, Star, ToggleLeft, ToggleRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Card, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const shiftBadge = { morning: "secondary", evening: "sky", night: "violet" } as const;

export default function AdminStaff() {
  const doctors = useStore((s) => s.doctors);
  const staff = useStore((s) => s.staff);
  const toggleOnCall = useStore((s) => s.toggleOnCall);
  const appointments = useStore((s) => s.appointments);

  return (
    <>
      <PageHeader title="Staff & doctors" description="Departments, shifts and on-call coverage." />

      <Tabs defaultValue="doctors">
        <TabsList>
          <TabsTrigger value="doctors">Doctors ({doctors.length})</TabsTrigger>
          <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {doctors.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={d.name} className="size-12 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-sm text-muted-foreground">{d.specialty}</p>
                </div>
                <button
                  onClick={() => toggleOnCall(d.id)}
                  aria-label={`Toggle on-call for ${d.name}`}
                  className={cn("transition-colors", d.onCall ? "text-success" : "text-muted-foreground/40")}
                >
                  {d.onCall ? <ToggleRight className="size-7" /> : <ToggleLeft className="size-7" />}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant={shiftBadge[d.shift]}>UTC-shift: {d.shift}</Badge>
                <Badge variant="outline">Room {d.room}</Badge>
                {d.onCall && <Badge variant="success">On call</Badge>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {d.phone}</span>
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-warning text-warning" /> {d.rating} · {d.experienceYears}y
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {appointments.filter((a) => a.doctorId === d.id && a.status !== "cancelled").length} total appointments
              </p>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <CardTitle>Nurses, techs & admin</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                    <th className="px-6 py-3 font-medium">Department</th>
                    <th className="px-6 py-3 font-medium">Shift</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium text-right">On call</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                      <td className="px-6 py-3.5 font-medium">{m.name}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">{m.role}</td>
                      <td className="px-6 py-3.5 text-muted-foreground">{m.department}</td>
                      <td className="px-6 py-3.5">
                        <Badge variant={shiftBadge[m.shift]}>{m.shift}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-muted-foreground tabular-nums">{m.phone}</td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          onClick={() => toggleOnCall(m.id)}
                          aria-label={`Toggle on-call for ${m.name}`}
                          className={cn("inline-block transition-colors", m.onCall ? "text-success" : "text-muted-foreground/40")}
                        >
                          {m.onCall ? <ToggleRight className="size-6" /> : <ToggleLeft className="size-6" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
