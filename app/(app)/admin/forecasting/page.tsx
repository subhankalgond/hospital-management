"use client";

import * as React from "react";
import { BedDouble, TrendingUp, Users, Info, ShieldCheck, AlertTriangle } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatCard,
  Button,
} from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";

interface ForecastResponse {
  capacity: {
    physical: number;
    operational: number;
    occupied: number;
    reserved: number;
    available: number;
    turnoverPipeline: number;
    maintenance: number;
  };
  forecast: {
    horizonDays: number;
    expectedAdmissionsPerDay: number;
    forecastOccupied: number;
    shortfallRisk: boolean;
    basis: string;
    sampleDays: number;
    uncertaintyNote: string;
    status: "available" | "insufficient-data";
  };
  hasEnoughData: boolean;
  minRecordsRequired: number;
  staffing: {
    roster: { morning: number; evening: number; night: number };
    onCall: number;
    totalDoctors: number;
    pressure: "low" | "medium" | "high" | "unknown";
    workloadNote: string;
  };
  operational: {
    appointmentsToday: number;
    activeEmergencies: number;
    criticalWaiting: number;
  };
  losModel: { status: string; source: string; note: string };
  generatedAt: string;
}

export default function ForecastingPage() {
  const [data, setData] = React.useState<ForecastResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/forecast/overview")
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Failed to load forecasting data.");
        if (alive) setData(d as ForecastResponse);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Failed."));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <>
        <PageHeader kicker="Hospital Forecasting" title="Forecast unavailable" />
        <Card className="border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error}</Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader kicker="Hospital Forecasting" title="Loading…" />
        <p className="py-10 text-center text-sm text-muted-foreground">Crunching capacity & demand data…</p>
      </>
    );
  }

  const occPct = data.capacity.operational
    ? Math.round(((data.capacity.occupied + data.capacity.reserved) / data.capacity.operational) * 100)
    : 0;

  return (
    <>
      <PageHeader
        kicker="Hospital Forecasting"
        title="Capacity & demand outlook"
        description="Live occupancy from the real bed inventory; demand forecasting activates once enough admissions history accumulates."
      />

      {/* ── current capacity (raw truth, no ML) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Operational beds" value={`${data.capacity.operational}`} sub={`${data.capacity.physical} physical · ${data.capacity.maintenance} in maintenance`} />
        <StatCard label="Occupied now" value={`${data.capacity.occupied}`} sub={`${occPct}% of operational`} />
        <StatCard label="Available to assign" value={`${data.capacity.available}`} sub={`${data.capacity.reserved} reserved for emergencies`} />
        <StatCard label="In turnover" value={`${data.capacity.turnoverPipeline}`} sub="discharge-pending / cleaning / inspection" />
      </div>

      {/* ── bed demand forecast ── */}
      <Card className="mt-6">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-primary" /> 7-day bed demand forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          {data.forecast.status === "available" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Expected admissions/day" value={`~${data.forecast.expectedAdmissionsPerDay}`} />
                <StatCard label="Forecast occupied (7d)" value={`${data.forecast.forecastOccupied}`} sub={`of ${data.capacity.operational} operational`} />
                <StatCard
                  label="Shortage risk"
                  value={data.forecast.shortfallRisk ? "Yes" : "No"}
                  sub={data.forecast.shortfallRisk ? "Forecast occupancy meets capacity — plan discharges" : "No shortfall projected"}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Basis: {data.forecast.basis}. {data.forecast.uncertaintyNote}
              </p>
            </>
          ) : (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-sm">
                <Info className="size-4 text-amber-600" /> Not enough data for a reliable forecast yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                The demand model needs admission history covering at least{" "}
                <strong>{data.minRecordsRequired} distinct days</strong> — the bed log currently holds{" "}
                <strong>{data.forecast.sampleDays}</strong>. The figures above (capacity, occupancy, available
                beds) are live operational statistics, not predictions, and remain valid. No forecast is shown
                because presenting one would be unreliable and misleading.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                An authorized administrator can import historical admissions (CSV with date, ward, admission
                count) to accelerate the training gate — see Documentation → Forecasting for the template.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── staffing ── */}
      <Card className="mt-6">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" /> Staffing pressure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Morning shift" value={`${data.staffing.roster.morning}`} />
            <StatCard label="Evening shift" value={`${data.staffing.roster.evening}`} />
            <StatCard label="Night shift" value={`${data.staffing.roster.night}`} />
            <StatCard label="On call tonight" value={`${data.staffing.onCall}`} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pressure level</span>
            <Badge
              variant={
                data.staffing.pressure === "high"
                  ? "destructive"
                  : data.staffing.pressure === "medium"
                    ? "warning"
                    : data.staffing.pressure === "unknown"
                      ? "outline"
                      : "success"
              }
            >
              {data.staffing.pressure}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{data.staffing.workloadNote}</p>
        </CardContent>
      </Card>

      {/* ── operational context ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Appointments today" value={`${data.operational.appointmentsToday}`} />
        <StatCard label="Active emergency cases" value={`${data.operational.activeEmergencies}`} />
        <StatCard label="Critical awaiting review" value={`${data.operational.criticalWaiting}`} />
      </div>

      {/* ── model status / transparency ── */}
      <Card className="mt-6">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Model registry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-4 py-3">
            <div>
              <p className="font-semibold">Length-of-Stay (RandomForest)</p>
              <p className="text-xs text-muted-foreground">{data.losModel.note}</p>
            </div>
            <Badge variant="success">validated · in use</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-4 py-3">
            <div>
              <p className="font-semibold">Bed demand forecast (admission-frequency)</p>
              <p className="text-xs text-muted-foreground">
                {data.hasEnoughData ? data.forecast.basis : `Awaiting data: ${data.forecast.sampleDays}/${data.minRecordsRequired} days`}
              </p>
            </div>
            <Badge variant={data.hasEnoughData ? "success" : "outline"}>
              {data.hasEnoughData ? "active" : "insufficient data"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-4 py-3">
            <div>
              <p className="font-semibold">Staffing pressure estimate</p>
              <p className="text-xs text-muted-foreground">Derived from demand forecast × shift roster</p>
            </div>
            <Badge variant={data.hasEnoughData ? "success" : "outline"}>
              {data.hasEnoughData ? "active" : "insufficient data"}
            </Badge>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Forecasts are decision support for administrators, not guarantees. Generated {new Date(data.generatedAt).toLocaleString()}.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-2">
        <Button variant="outline">
          <a href="/beds">Open bed management</a>
        </Button>
      </div>
    </>
  );
}
