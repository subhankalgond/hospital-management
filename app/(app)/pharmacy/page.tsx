"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { MedicationOrder, MedicationOrderStatus } from "@/lib/types";
import { Badge, Button, Card, Input, StatCard, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";

const STATUS_BADGE: Record<string, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  pending_review: { label: "Pending review", variant: "warning" },
  verified: { label: "Verified", variant: "sky" },
  dispensing: { label: "Dispensing", variant: "sky" },
  dispensed: { label: "Dispensed", variant: "success" },
  clarification_required: { label: "Clarification required", variant: "destructive" },
  on_hold: { label: "On hold", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const ORDER: MedicationOrderStatus[] = [
  "pending_review",
  "clarification_required",
  "on_hold",
  "verified",
  "dispensed",
  "cancelled",
];

export default function PharmacyPanel() {
  const orders = useStore((s) => s.medicationOrders);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const inventory = useStore((s) => s.inventory);
  const pharmacyAction = useStore((s) => s.pharmacyAction);
  const [filter, setFilter] = React.useState<MedicationOrderStatus | "all">("pending_review");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    useStore.getState().refresh();
    const iv = setInterval(() => useStore.getState().refresh(), 20_000);
    return () => clearInterval(iv);
  }, []);

  const filtered = orders
    .filter((o) => (filter === "all" ? true : o.status === filter))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const pending = orders.filter((o) => o.status === "pending_review").length;
  const dispensed = orders.filter((o) => o.status === "dispensed").length;
  const needsAttention = orders.filter(
    (o) => o.status === "clarification_required" || o.status === "on_hold"
  ).length;

  const stockOf = (drug: string) => inventory.find((i) => i.name.toLowerCase() === drug.toLowerCase());
  const pinfo = (id: string) => patients.find((p) => p.id === id);
  const dname = (id: string) => doctors.find((d) => d.id === id)?.name ?? "—";

  async function act(order: MedicationOrder, action: "verify" | "dispense" | "hold" | "clarify" | "cancel") {
    if (busyId) return;
    setBusyId(order.id);
    setErr(null);
    try {
      const res = await pharmacyAction(order.id, action, notes[order.id] ?? "");
      if (!res.ok) setErr(res.error ?? "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Pharmacy"
        kicker="Dispensary"
        description="Prescriptions arrive automatically from the clinicians' consultations — verified, dispensed and inventoried here."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending review" value={String(pending)} tone={pending ? "warning" : "default"} sub="awaiting pharmacist verification" />
        <StatCard label="Needs attention" value={String(needsAttention)} tone={needsAttention ? "warning" : "default"} sub="clarification or hold" />
        <StatCard label="Dispensed" value={String(dispensed)} tone="success" sub="lifetime orders completed" />
      </div>

      {err && (
        <Card className="mt-5 border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{err}</Card>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {(["pending_review", "verified", "clarification_required", "on_hold", "dispensed", "cancelled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors " +
              (filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted")
            }
          >
            {f === "all" ? "All" : STATUS_BADGE[f].label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {filtered.length === 0 && (
          <EmptyState title={filter === "all" ? "No prescriptions yet" : "Nothing in this queue"} />
        )}
        {filtered.map((o) => {
          const p = pinfo(o.patientId);
          const stock = stockOf(o.drug);
          const lowStock = stock && stock.stock <= stock.reorderLevel;
          const busy = busyId === o.id;
          return (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif text-lg">
                    {o.drug}
                    {o.dosage ? ` ${o.dosage}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {o.route} · {o.frequency || "—"} · {o.durationDays || "—"} {o.durationDays === 1 ? "day" : "days"}
                    {o.quantity ? ` · qty ${o.quantity}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Order <span className="font-mono">{o.id}</span> · Patient{" "}
                    <span className="font-mono">{p?.patientCode || o.patientId}</span> · {p?.name ?? "—"}
                    {p?.allergies?.length ? (
                      <span className="text-destructive"> · allergies: {p.allergies.join(", ")}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Prescribed by {dname(o.doctorId)} · {o.prescriptionId ? `Rx ${o.prescriptionId}` : ""} ·{" "}
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                  {o.instructions && <p className="mt-1 text-sm">{o.instructions}</p>}
                  {o.noteFromPharmacy && (
                    <p className="mt-1 text-xs text-muted-foreground">Pharmacy note: {o.noteFromPharmacy}</p>
                  )}
                  {(o.verifiedByName || o.dispensedByName) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.verifiedByName && `Verified by ${o.verifiedByName}`}
                      {o.verifiedAt && ` ${dateLabel(o.verifiedAt.slice(0, 10))}`}
                      {o.dispensedByName && ` · Dispensed by ${o.dispensedByName}`}
                      {o.dispensedAt && ` ${dateLabel(o.dispensedAt.slice(0, 10))}`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {(() => {
                    const v = STATUS_BADGE[o.status];
                    return <Badge variant={v.variant}>{v.label}</Badge>;
                  })()}
                  {stock ? (
                    <p className={`text-xs font-medium ${lowStock ? "text-warning" : "text-muted-foreground"}`}>
                      Stock: {stock.stock} {stock.unit}
                      {lowStock ? " · low" : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not in inventory</p>
                  )}
                </div>
              </div>

              {/* actions per state */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {o.status === "pending_review" && (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => act(o, "verify")}>
                      {busy ? "Working…" : "Verify prescription"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(o, "clarify")}>
                      Request clarification
                    </Button>
                  </>
                )}
                {o.status === "verified" && (
                  <Button size="sm" disabled={busy} onClick={() => act(o, "dispense")}>
                    {busy ? "Dispensing…" : "Dispense"}
                  </Button>
                )}
                {(o.status === "pending_review" || o.status === "clarification_required") && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(o, "hold")}>
                    Put on hold
                  </Button>
                )}
                {o.status !== "dispensed" && o.status !== "verified" && o.status !== "dispensing" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(o, "cancel")}>
                    Cancel order
                  </Button>
                )}
                {(o.status === "clarification_required" || o.status === "on_hold" || o.status === "pending_review") && (
                  <Input
                    className="max-w-xs"
                    placeholder="Note (optional)"
                    value={notes[o.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value.slice(0, 300) }))}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
