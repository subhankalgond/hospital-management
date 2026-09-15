"use client";

import Link from "next/link";
import { BedDouble, CalendarCheck, FlaskConical, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress, StatCard } from "@/components/ui/primitives";
import { PageHeader, InvoiceStatusBadge } from "@/components/ui/misc";
import { RevenueArea, DeptBars } from "@/components/ui/charts";
import { revenueSeries } from "@/lib/seed";
import { fmtMoney, todayISO, dateLabel } from "@/lib/utils";

export default function AdminDashboard() {
  const appointments = useStore((s) => s.appointments);
  const invoices = useStore((s) => s.invoices);
  const labs = useStore((s) => s.labs);
  const doctors = useStore((s) => s.doctors);
  const wards = useStore((s) => s.wards);
  const patients = useStore((s) => s.patients);

  const today = todayISO();
  const todaysAppts = appointments.filter((a) => a.date === today && a.status !== "cancelled");
  const weekRevenue = revenueSeries().reduce((s, d) => s + d.revenue, 0);
  const pendingLabs = labs.filter((l) => l.status !== "resulted");

  const allBeds = wards.flatMap((w) => w.rooms.flatMap((r) => r.beds));
  const occupied = allBeds.filter((b) => b.patientId).length;
  const occupancy = Math.round((occupied / allBeds.length) * 100);

  const deptCounts = doctors.map((d) => ({
    dept: d.department.split(" ")[0],
    count: appointments.filter((a) => a.doctorId === d.id && a.status !== "cancelled").length,
  }));

  const recentInvoices = [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <>
      <PageHeader title="Operations dashboard" description="Hospital-wide pulse for today and this week." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Appointments today" value={todaysAppts.length} icon={<CalendarCheck className="size-5" />} tone="primary" sub={`${appointments.filter((a) => a.date === today && a.queueStatus === "completed").length} completed so far`} />
        <StatCard label="Revenue (7 days)" value={fmtMoney(weekRevenue)} icon={<TrendingUp className="size-5" />} tone="success" sub="Paid + baseline simulation" />
        <StatCard label="Bed occupancy" value={`${occupancy}%`} icon={<BedDouble className="size-5" />} tone={occupancy > 80 ? "warning" : "default"} sub={`${occupied}/${allBeds.length} beds occupied`} />
        <StatCard label="Pending labs" value={pendingLabs.length} icon={<FlaskConical className="size-5" />} tone={pendingLabs.length ? "warning" : "success"} sub="Requested or in progress" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Revenue — last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueArea data={revenueSeries()} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Appointments by department</CardTitle>
          </CardHeader>
          <CardContent>
            <DeptBars data={deptCounts} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>On-call now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {doctors.filter((d) => d.onCall).map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.specialty} · {d.department}</p>
                </div>
                <Badge variant="success">On call</Badge>
              </div>
            ))}
            {doctors.filter((d) => d.onCall).length === 0 && (
              <p className="text-sm text-muted-foreground">No doctors currently on call.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent invoices
              <Link href="/admin/billing" className="text-sm font-medium text-primary hover:underline">View all →</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {recentInvoices.map((inv) => {
              const p = patients.find((x) => x.id === inv.patientId);
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">{inv.id} · {dateLabel(inv.date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{fmtMoney(inv.items.reduce((s, it) => s + it.amount, 0))}</span>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ward occupancy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {wards.map((w) => {
            const beds = w.rooms.flatMap((r) => r.beds);
            const occ = beds.filter((b) => b.patientId).length;
            const pct = Math.round((occ / beds.length) * 100);
            return (
              <div key={w.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{w.name} <span className="text-muted-foreground">· Floor {w.floor}</span></span>
                  <span className="text-muted-foreground tabular-nums">{occ}/{beds.length}</span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
          <Link href="/admin/wards" className="block pt-1 text-sm font-medium text-primary hover:underline">
            Manage wards & beds →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
