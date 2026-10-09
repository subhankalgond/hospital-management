"use client";

import Link from "next/link";
import { BedDouble, CalendarCheck, FlaskConical, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress, StatCard, EmptyState } from "@/components/ui/primitives";
import { PageHeader, InvoiceStatusBadge } from "@/components/ui/misc";
import { RevenueArea, DeptBars } from "@/components/ui/charts";
import { fmtMoney, todayISO, dateLabel, addDays } from "@/lib/utils";

/** revenue for the last 7 days, derived from actually-paid invoices */
function revenueFromInvoices(paidInvoices: { paidAt?: string; items: { amount: number }[] }[]) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i - 6));
  return days.map((d) => {
    const total = paidInvoices
      .filter((inv) => inv.paidAt === d)
      .reduce((s, inv) => s + inv.items.reduce((x, it) => x + it.amount, 0), 0);
    return { day: d.slice(5), revenue: total };
  });
}

export default function AdminDashboard() {
  const appointments = useStore((s) => s.appointments);
  const invoices = useStore((s) => s.invoices);
  const labs = useStore((s) => s.labs);
  const doctors = useStore((s) => s.doctors);
  const wards = useStore((s) => s.wards);
  const patients = useStore((s) => s.patients);

  const today = todayISO();
  const todaysAppts = appointments.filter((a) => a.date === today && a.status !== "cancelled");
  const revenue = revenueFromInvoices(invoices.filter((i) => i.status === "paid"));
  const weekRevenue = revenue.reduce((s, d) => s + d.revenue, 0);
  const pendingLabs = labs.filter((l) => l.status !== "resulted");

  const allBeds = wards.flatMap((w) => w.rooms.flatMap((r) => r.beds));
  const occupied = allBeds.filter((b) => b.patientId).length;
  const occupancy = allBeds.length ? Math.round((occupied / allBeds.length) * 100) : 0;

  const deptCounts = doctors.map((d) => ({
    dept: d.department.split(" ")[0],
    count: appointments.filter((a) => a.doctorId === d.id && a.status !== "cancelled").length,
  }));

  const recentInvoices = [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const onCallDocs = doctors.filter((d) => d.onCall);

  return (
    <>
      <PageHeader kicker="Hospital Operations" title="Executive Dashboard" description="Hospital-wide metrics, department activity, and ward occupancy for today and this week." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Appointments Today" value={todaysAppts.length} icon={<CalendarCheck className="size-4" />} tone="primary" sub={`${appointments.filter((a) => a.date === today && a.queueStatus === "completed").length} completed so far`} />
        <StatCard label="7-Day Revenue" value={fmtMoney(weekRevenue)} icon={<TrendingUp className="size-4" />} tone="success" sub="From paid invoices" />
        <StatCard label="Bed Occupancy" value={`${occupancy}%`} icon={<BedDouble className="size-4" />} tone={occupancy > 80 ? "warning" : "default"} sub={`${occupied}/${allBeds.length} beds occupied`} />
        <StatCard label="Pending Labs" value={pendingLabs.length} icon={<FlaskConical className="size-4" />} tone={pendingLabs.length ? "warning" : "success"} sub="Requested or in progress" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Revenue — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {weekRevenue === 0 ? (
              <EmptyState
                emoji="📈"
                title="No revenue recorded yet"
                description="Once invoices are marked as paid, collections show up here."
              />
            ) : (
              <RevenueArea data={revenue} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Appointments by Department</CardTitle>
          </CardHeader>
          <CardContent>
            {deptCounts.length === 0 ? (
              <EmptyState emoji="🩺" title="No doctors registered yet" description="Departments fill in as doctors sign up." />
            ) : (
              <DeptBars data={deptCounts} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>On-Call Clinicians</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 pt-2">
            {onCallDocs.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-serif text-base font-normal text-foreground">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.specialty} · {d.department}</p>
                </div>
                <Badge variant="success">On Call</Badge>
              </div>
            ))}
            {onCallDocs.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No doctors currently on call.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Invoices
              <Link href="/admin/billing" className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline">View All →</Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 pt-2">
            {recentInvoices.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No invoices recorded yet.
              </p>
            )}
            {recentInvoices.map((inv) => {
              const p = patients.find((x) => x.id === inv.patientId);
              return (
                <div key={inv.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-normal text-foreground">{p?.name ?? "Unknown Patient"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{inv.id} · {dateLabel(inv.date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-base font-normal tabular-nums">{fmtMoney(inv.items.reduce((s, it) => s + it.amount, 0))}</span>
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
          <CardTitle>Ward & Bed Occupancy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {wards.map((w) => {
            const beds = w.rooms.flatMap((r) => r.beds);
            const occ = beds.filter((b) => b.patientId).length;
            const pct = beds.length ? Math.round((occ / beds.length) * 100) : 0;
            return (
              <div key={w.id} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wider text-foreground">{w.name} <span className="text-muted-foreground font-normal">· Floor {w.floor}</span></span>
                  <span className="text-muted-foreground tabular-nums font-mono">{occ}/{beds.length} occupied ({pct}%)</span>
                </div>
                <Progress value={pct} />
              </div>
            );
          })}
          <Link href="/admin/wards" className="inline-block pt-2 text-xs font-semibold uppercase tracking-wider text-primary hover:underline">
            Manage Wards & Beds →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
