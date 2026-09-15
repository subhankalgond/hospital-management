"use client";

import * as React from "react";
import { ChevronDown, CreditCard, ReceiptText } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";
import { PageHeader, InvoiceStatusBadge } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/primitives";
import { dateLabel, fmtMoney } from "@/lib/utils";

export default function PatientBilling() {
  const session = useStore((s) => s.session)!;
  const invoices = useStore((s) => s.invoices);
  const payInvoice = useStore((s) => s.payInvoice);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState<string | null>(null);

  const mine = invoices
    .filter((i) => i.patientId === session.patientId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const owed = mine.filter((i) => i.status !== "paid");
  const totalDue = owed.reduce((s, i) => s + i.items.reduce((x, it) => x + it.amount, 0), 0);
  const overdueCount = mine.filter((i) => i.status === "overdue").length;
  const paidYTD = mine
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.items.reduce((x, it) => x + it.amount, 0), 0);

  function confirmPay(id: string) {
    setPaying(id);
    setTimeout(() => {
      payInvoice(id);
      setPaying(null);
    }, 900);
  }

  return (
    <>
      <PageHeader title="Billing & payments" description="Invoices for consultations, labs and procedures." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={fmtMoney(totalDue)} tone={totalDue ? "warning" : "success"} icon={<ReceiptText className="size-5" />} sub={`${owed.length} unpaid invoice${owed.length === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={overdueCount} tone={overdueCount ? "warning" : "default"} icon={<ReceiptText className="size-5" />} sub={overdueCount ? "Action needed" : "Nothing overdue"} />
        <StatCard label="Paid to date" value={fmtMoney(paidYTD)} tone="primary" icon={<CreditCard className="size-5" />} sub="Lifetime with CarePulse" />
      </div>

      <div className="mt-6 space-y-3">
        {mine.length === 0 && <EmptyState emoji="🧾" title="No invoices yet" />}
        {mine.map((inv) => {
          const total = inv.items.reduce((s, it) => s + it.amount, 0);
          const isOpen = expanded === inv.id;
          return (
            <Card key={inv.id} className="overflow-hidden">
              <button
                className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-muted/40"
                onClick={() => setExpanded(isOpen ? null : inv.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-4">
                  <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <ReceiptText className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold tabular-nums">{inv.id}</p>
                    <p className="text-sm text-muted-foreground">
                      Issued {dateLabel(inv.date)} · Due {dateLabel(inv.dueDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg font-bold tabular-nums">{fmtMoney(total)}</span>
                  <InvoiceStatusBadge status={inv.status} />
                  <ChevronDown className={"size-4 text-muted-foreground transition-transform " + (isOpen ? "rotate-180" : "")} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t bg-muted/30 px-5 py-4 animate-fade-in">
                  <div className="space-y-2">
                    {inv.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{it.label}</span>
                        <span className="tabular-nums">{fmtMoney(it.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{fmtMoney(total)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    {inv.status !== "paid" ? (
                      <Button
                        variant="gradient"
                        size="sm"
                        disabled={paying === inv.id}
                        onClick={() => confirmPay(inv.id)}
                      >
                        <CreditCard />
                        {paying === inv.id ? "Processing…" : inv.status === "overdue" ? "Pay now (overdue)" : "Pay now"}
                      </Button>
                    ) : (
                      <Badge variant="success">Paid {inv.paidAt ? dateLabel(inv.paidAt) : ""} ✓</Badge>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
