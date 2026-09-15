"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { InvoiceStatus } from "@/lib/types";
import { Badge, Button, Card, EmptyState, StatCard } from "@/components/ui/primitives";
import { PageHeader, InvoiceStatusBadge } from "@/components/ui/misc";
import { dateLabel, fmtMoney } from "@/lib/utils";

const FILTERS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];

export default function AdminBilling() {
  const invoices = useStore((s) => s.invoices);
  const patients = useStore((s) => s.patients);
  const payInvoice = useStore((s) => s.payInvoice);
  const [filter, setFilter] = React.useState<InvoiceStatus | "all">("all");

  const filtered = invoices
    .filter((i) => (filter === "all" ? true : i.status === filter))
    .sort((a, b) => b.date.localeCompare(a.date));

  const total = invoices.reduce((s, i) => s + i.items.reduce((x, it) => x + it.amount, 0), 0);
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.items.reduce((x, it) => x + it.amount, 0), 0);
  const outstanding = total - paid;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  return (
    <>
      <PageHeader title="Billing" description="Every invoice across the hospital." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total billed" value={fmtMoney(total)} tone="primary" sub={`${invoices.length} invoices`} />
        <StatCard label="Collected" value={fmtMoney(paid)} tone="success" sub={`${Math.round((paid / Math.max(total, 1)) * 100)}% collection rate`} />
        <StatCard label="Outstanding" value={fmtMoney(outstanding)} tone={overdueCount ? "warning" : "default"} sub={`${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}`} />
      </div>

      <div className="mb-4 mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all " +
              (filter === f.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-medium">Invoice</th>
                <th className="px-6 py-3 font-medium">Patient</th>
                <th className="px-6 py-3 font-medium">Issued</th>
                <th className="px-6 py-3 font-medium">Due</th>
                <th className="px-6 py-3 font-medium text-right">Amount</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">No invoices match this filter.</td>
                </tr>
              )}
              {filtered.map((inv) => {
                const p = patients.find((x) => x.id === inv.patientId);
                const amount = inv.items.reduce((s, it) => s + it.amount, 0);
                return (
                  <tr key={inv.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                    <td className="px-6 py-3.5">
                      <p className="font-medium tabular-nums">{inv.id}</p>
                      <p className="text-xs text-muted-foreground">{inv.items.length} item{inv.items.length === 1 ? "" : "s"}</p>
                    </td>
                    <td className="px-6 py-3.5 font-medium">{p?.name}</td>
                    <td className="px-6 py-3.5 text-muted-foreground">{dateLabel(inv.date)}</td>
                    <td className="px-6 py-3.5 text-muted-foreground">{dateLabel(inv.dueDate)}</td>
                    <td className="px-6 py-3.5 text-right font-semibold tabular-nums">{fmtMoney(amount)}</td>
                    <td className="px-6 py-3.5"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="px-6 py-3.5 text-right">
                      {inv.status !== "paid" ? (
                        <Button size="sm" variant="outline" onClick={() => payInvoice(inv.id)}>Mark paid</Button>
                      ) : (
                        <Badge variant="success">✓ Settled</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
