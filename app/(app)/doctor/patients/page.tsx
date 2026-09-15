"use client";

import * as React from "react";
import { Search } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Card, EmptyState, Input } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { ageFrom } from "@/lib/utils";

export default function DoctorPatients() {
  const patients = useStore((s) => s.patients);
  const [q, setQ] = React.useState("");

  const filtered = patients.filter((p) => {
    const hay = `${p.name} ${p.conditions.join(" ")} ${p.id}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <PageHeader
        title="Patients"
        description="Search your patient directory and open a chart."
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patients…"
              className="w-64 pl-9"
              aria-label="Search patients"
            />
          </div>
        }
      />

      {filtered.length === 0 && <EmptyState emoji="🔍" title="No patients match" description={`Nothing found for “${q}”.`} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Link key={p.id} href={`/doctor/patients/${p.id}`} className="group">
            <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-lift">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} className="size-12 text-base" />
                <div className="min-w-0">
                  <p className="truncate font-semibold group-hover:text-primary">{p.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ageFrom(p.dob)} yrs · {p.gender === "female" ? "Female" : "Male"} · {p.bloodGroup}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.allergies.map((a) => (
                  <Badge key={a} variant="destructive">⚠ {a}</Badge>
                ))}
                {p.conditions.map((c) => (
                  <Badge key={c} variant="warning">{c}</Badge>
                ))}
                {p.allergies.length === 0 && p.conditions.length === 0 && (
                  <Badge variant="outline">No flags</Badge>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
