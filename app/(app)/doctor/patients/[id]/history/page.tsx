"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CalendarRange, Stethoscope, Pill, FlaskConical, Clock, History } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatCard,
  Input,
  Label,
} from "@/components/ui/primitives";
import { ageFrom, dateLabel, dayLabel } from "@/lib/utils";

interface HistoryVisit {
  id: string;
  date: string;
  department: string;
  diagnosis: string;
  notes: string;
  doctorName: string;
  vitals: { bp?: string; hr?: number; tempC?: number; spo2?: number; weightKg?: number };
  prescriptions: {
    id: string;
    doctorName: string;
    active: boolean;
    items: { drug: string; dosage: string; frequency: string; durationDays: number; instructions?: string }[];
  }[];
  labs: { id: string; test: string; status: string; result?: string }[];
}

interface HistoryResponse {
  patient: {
    id: string;
    name: string;
    email: string;
    phone: string;
    dob: string;
    gender: string;
    bloodGroup: string;
    allergies: string[];
    conditions: string[];
    emergencyContact: { name: string; phone: string; relation: string };
    createdAt: string;
  };
  counts: { total: number; thisWeek: number; thisMonth: number; thisYear: number };
  visits: HistoryVisit[];
  upcoming: { id: string; date: string; time: string; doctorName: string; reason: string; status: string }[];
  appliedRange: { from: string; to: string } | null;
  period: string;
}

const PERIODS: { key: string; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "last-year", label: "Last year" },
  { key: "custom", label: "Custom range" },
  { key: "all", label: "All-time" },
];

const URGENCY_BADGE: Record<string, string> = {
  emergency: "destructive",
  urgent: "warning",
  routine: "outline",
};

export default function PatientHistoryPage({ params }: { params: { id: string } }) {
  const [period, setPeriod] = React.useState("all");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ period });
    if (period === "custom") {
      if (customFrom) qs.set("from", customFrom);
      if (customTo) qs.set("to", customTo);
    }
    try {
      const res = await fetch(`/api/patients/${params.id}/history?${qs.toString()}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to load history.");
      }
      setData((await res.json()) as HistoryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setData(null);
    }
    setLoading(false);
  }, [params.id, period, customFrom, customTo]);

  React.useEffect(() => {
    load();
  }, [load]);

  const p = data?.patient;

  return (
    <>
      <Link
        href="/doctor/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All patients
      </Link>

      {loading && !data && <p className="py-10 text-center text-sm text-muted-foreground">Loading history…</p>}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</Card>
      )}

      {p && data && (
        <>
          {/* header */}
          <Card className="overflow-hidden">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              <Avatar name={p.name} className="size-14 text-lg" />
              <div className="min-w-0">
                <p className="font-serif text-2xl">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.id.toUpperCase()} · {ageFrom(p.dob)} yrs · {p.gender} · Blood {p.bloodGroup || "—"} ·
                  registered {dateLabel((p.createdAt ?? "").slice(0, 10))}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                {p.allergies.map((a) => (
                  <Badge key={a} variant="destructive">
                    {a}
                  </Badge>
                ))}
                {p.conditions.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* real counts from encounters */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total visits (all-time)" value={String(data.counts.total)} />
            <StatCard label="Visits this week" value={String(data.counts.thisWeek)} />
            <StatCard label="Visits this month" value={String(data.counts.thisMonth)} />
            <StatCard label="Visits this year" value={String(data.counts.thisYear)} />
          </div>

          {/* period filter */}
          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setPeriod(opt.key)}
                    className={`rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                      period === opt.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label htmlFor="from">From</Label>
                    <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="to">To</Label>
                    <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </div>
              )}
              {data.appliedRange && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarRange className="size-3.5" />
                  Showing {dateLabel(data.appliedRange.from)} → {dateLabel(data.appliedRange.to)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* upcoming follow-ups */}
          {data.upcoming.length > 0 && (
            <Card className="mt-6 border-primary/30">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="size-4 text-primary" /> Outstanding follow-ups ({data.upcoming.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4">
                {data.upcoming.map((u) => (
                  <p key={u.id} className="text-sm">
                    <strong>{dayLabel(u.date)}</strong> {u.time} — {u.doctorName} · “{u.reason}”
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* timeline */}
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <History className="size-4" /> Visit timeline ({data.visits.length}
                {period !== "all" ? " in period" : " total"})
              </p>
            </div>

            {data.visits.length === 0 && (
              <EmptyState title="No visits in the selected period" />
            )}

            <div className="space-y-4">
              {data.visits.map((v) => (
                <Card key={v.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {dayLabel(v.date)} · {v.department} · Outpatient
                        </p>
                        <p className="mt-1 font-serif text-lg">{v.diagnosis || "Assessment pending"}</p>
                        <p className="text-sm text-muted-foreground">Clinician: {v.doctorName}</p>
                      </div>
                      <Badge variant="outline">{v.id}</Badge>
                    </div>

                    {v.notes && <p className="mt-3 text-sm">{v.notes}</p>}

                    {/* vitals row */}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[
                        { k: "BP", v: v.vitals?.bp || "—" },
                        { k: "HR", v: v.vitals?.hr ? `${v.vitals.hr} bpm` : "—" },
                        { k: "Temp", v: v.vitals?.tempC ? `${v.vitals.tempC}°C` : "—" },
                        { k: "SpO₂", v: v.vitals?.spo2 ? `${v.vitals.spo2}%` : "—" },
                        { k: "Weight", v: v.vitals?.weightKg ? `${v.vitals.weightKg} kg` : "—" },
                      ].map((x) => (
                        <div key={x.k} className="rounded bg-muted/60 px-2.5 py-2 text-center">
                          <p className="text-[11px] text-muted-foreground">{x.k}</p>
                          <p className="text-sm font-semibold tabular-nums">{x.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* prescriptions & labs from the same date */}
                    {v.prescriptions.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {v.prescriptions.map((rx) => (
                          <div key={rx.id} className="flex items-start gap-2 rounded border px-3 py-2 text-sm">
                            <Pill className="mt-0.5 size-4 shrink-0 text-primary" />
                            <div>
                              <p className="font-medium">
                                {rx.items[0]?.drug}
                                {rx.items.length > 1 ? ` +${rx.items.length - 1} more` : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rx.items[0]?.dosage} · {rx.items[0]?.frequency} · {rx.items[0]?.durationDays}d ·{" "}
                                {rx.active ? "active" : "completed"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {v.labs.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {v.labs.map((l) => (
                          <div key={l.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                            <FlaskConical className="size-4 shrink-0 text-info" />
                            <span className="font-medium">{l.test}</span>
                            <Badge variant={l.status === "resulted" ? "success" : "outline"}>{l.status}</Badge>
                            {l.result && <span className="text-xs text-muted-foreground">→ {l.result}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
