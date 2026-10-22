"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, EmptyState, Input, Label } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";
import { Users, Search, User } from "lucide-react";

export default function AdminPatients() {
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);

  const [search, setSearch] = React.useState("");
  const filtered = patients.filter(
    (p) =>
      (p.patientCode?.includes(search) || "")
        ?.includes(search) ||
      (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <>
      <PageHeader
        title="Patients"
        description="Permanent patient registry with Patient IDs"
        actions={
          <Badge variant="outline" className="text-sm">
            {filtered.length} of {patients.length} shown
          </Badge>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Search by Patient ID or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="size-4" />}
          className="w-full max-w-md"
        />
      </div>

      {patients.length === 0 && (
        <EmptyState emoji="👤" title="No patients registered" />
      )}

      {filtered.length === 0 && (
        <EmptyState emoji="🔍" title="No patients match your search" />
      )}

      {filtered.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <User className="size-4 text-primary" />
              <p className="text-sm font-semibold tabular-nums">
                {p.patientCode ?? "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                UUID: {p.id.substring(0, 8)}…
              </p>
              <p className="font-medium mt-1">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                {dateLabel(p.createdAt)} · Role: {p.role}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}