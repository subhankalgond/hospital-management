"use client";

import * as React from "react";
import {
  BedDouble, Brush, CheckCircle2, ClipboardCheck, History, LogOut, Wrench,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { BedState, BedStatus } from "@/lib/types";
import type { EmergencyCase } from "@/lib/types";
void (0 as unknown as EmergencyCase | undefined);
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Progress, StatCard,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, dateLabel, ageFrom } from "@/lib/utils";
import { PredictedDischargeChip } from "@/components/ml/PredictedDischargeChip";

const statusMeta: Record<BedStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "sky" | "violet" | "outline" }> = {
  available: { label: "Available", variant: "success" },
  reserved: { label: "Reserved", variant: "sky" },
  occupied: { label: "Occupied", variant: "default" },
  "discharge-pending": { label: "Discharge pending", variant: "warning" },
  cleaning: { label: "Cleaning", variant: "violet" },
  inspection: { label: "Inspection", variant: "warning" },
  maintenance: { label: "Maintenance", variant: "destructive" },
};

/** Next allowed actions per status — mirrors the server-side transition table. */
const NEXT: Record<BedStatus, { action: string; label: string; icon: React.ReactNode }[]> = {
  available: [{ action: "maintenance", label: "Send to maintenance", icon: <Wrench className="size-3.5" /> }],
  reserved: [
    { action: "release-reservation", label: "Release reservation", icon: <LogOut className="size-3.5" /> },
    { action: "maintenance", label: "Maintenance", icon: <Wrench className="size-3.5" /> },
  ],
  occupied: [
    { action: "discharge", label: "Start discharge", icon: <LogOut className="size-3.5" /> },
    { action: "start-cleaning", label: "Straight to cleaning", icon: <Brush className="size-3.5" /> },
  ],
  "discharge-pending": [{ action: "start-cleaning", label: "Start cleaning", icon: <Brush className="size-3.5" /> }],
  cleaning: [{ action: "inspect", label: "Send to inspection", icon: <ClipboardCheck className="size-3.5" /> }],
  inspection: [{ action: "release", label: "Release to available", icon: <CheckCircle2 className="size-3.5" /> }],
  maintenance: [{ action: "restore", label: "Restore to available", icon: <CheckCircle2 className="size-3.5" /> }],
};

const FILTERS: { key: "all" | BedStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "occupied", label: "Occupied" },
  { key: "reserved", label: "Reserved" },
  { key: "discharge-pending", label: "Turnaround" },
  { key: "cleaning", label: "Cleaning" },
  { key: "inspection", label: "Inspection" },
  { key: "maintenance", label: "Maintenance" },
];

export default function BedManagement() {
  const beds = useStore((s) => s.beds);
  const bedAudit = useStore((s) => s.bedAudit);
  const patients = useStore((s) => s.patients);
  const emergencies = useStore((s) => s.emergencies);
  const refreshBeds = useStore((s) => s.refreshBeds);
  const changeBedState = useStore((s) => s.changeBedState);

  const [filter, setFilter] = React.useState<"all" | BedStatus>("all");
  const [actionBed, setActionBed] = React.useState<{ bed: BedState; action: string; label: string } | null>(null);
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [historyBed, setHistoryBed] = React.useState<BedState | null>(null);

  React.useEffect(() => {
    void refreshBeds();
  }, [refreshBeds]);

  const byStatus = (s: BedStatus) => beds.filter((b) => b.status === s).length;
  const total = beds.length;
  const occPct = total ? Math.round((byStatus("occupied") / total) * 100) : 0;

  const visible = beds
    .filter((b) => (filter === "all" ? true : b.status === filter))
    .sort((a, b) => a.label.localeCompare(b.label));

  const wardIds = Array.from(new Set(visible.map((b) => b.wardId)));

  function needReason(action: string) {
    return action === "maintenance" || action === "restore";
  }

  async function runAction() {
    if (!actionBed) return;
    setErr(null);
    if (needReason(actionBed.action) && !reason.trim()) {
      setErr("A reason is required for this action.");
      return;
    }
    setBusy(true);
    const res = await changeBedState(actionBed.bed.id, actionBed.action as never, { reason: reason.trim() || undefined });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Could not update the bed."); return; }
    setActionBed(null);
    setReason("");
  }

  return (
    <>
      <PageHeader
        title="Bed Management"
        description="Monitor availability, occupancy, cleaning and maintenance across the hospital."
        actions={
          <Badge variant="outline" className="text-sm">{byStatus("occupied")}/{total} occupied · {occPct}%</Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total beds" value={total} icon={<BedDouble className="size-5" />} tone="primary" />
        <StatCard label="Available" value={byStatus("available")} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <StatCard label="Occupied" value={byStatus("occupied")} icon={<BedDouble className="size-5" />} />
        <StatCard label="Reserved" value={byStatus("reserved")} icon={<BedDouble className="size-5" />} />
        <StatCard label="Cleaning" value={byStatus("cleaning") + byStatus("inspection") + byStatus("discharge-pending")} icon={<Brush className="size-5" />} tone="warning" />
        <StatCard label="Maintenance" value={byStatus("maintenance")} icon={<Wrench className="size-5" />} tone={byStatus("maintenance") ? "warning" : "default"} />
      </div>

      <div className="mt-4">
        <Progress value={occPct} className="max-w-md" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
              filter === f.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">{byStatus(f.key as BedStatus)}</span>
            )}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <div className="mt-6">
          <EmptyState
            emoji="🛏"
            title="No beds yet"
            description="Beds are seeded automatically from your wards on first load. If you just added wards, refresh this page."
            action={<Button variant="outline" onClick={() => refreshBeds()}>Refresh</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {wardIds.map((wid) => {
            const wardBeds = visible.filter((b) => b.wardId === wid);
            const wardName = wardBeds[0]?.wardName ?? wid;
            const floor = wardBeds[0]?.floor ?? 0;
            const roomIds = Array.from(new Set(wardBeds.map((b) => b.roomId)));
            return (
              <section key={wid} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-bold">{wardName}</h2>
                  <Badge variant="outline">Floor {floor}</Badge>
                  <Badge variant="secondary">{wardBeds.length} beds</Badge>
                </div>
                {roomIds.map((rid) => {
                  const roomBeds = wardBeds.filter((b) => b.roomId === rid);
                  const roomLabel = roomBeds[0]?.roomLabel ?? rid;
                  const type = roomBeds[0]?.type as BedState["type"];
                  return (
                    <Card key={rid}>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          Room {roomLabel}
                          <Badge variant={type === "icu" ? "destructive" : type === "private" ? "sky" : "secondary"}>{type}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {roomBeds.map((bed) => {
                          const p = bed.patientId ? patients.find((x) => x.id === bed.patientId) : undefined;
                          const em = bed.reservedFor ? emergencies.find((e) => e.id === bed.reservedFor) : undefined;
                          const meta = statusMeta[bed.status];
                          return (
                            <div
                              key={bed.id}
                              className={cn(
                                "rounded-xl border p-3 transition-all",
                                bed.status === "available" && "bg-success/5 border-success/25",
                                bed.status === "occupied" && "bg-primary/5 border-primary/25",
                                bed.status === "maintenance" && "bg-destructive/5 border-destructive/25",
                                bed.status !== "available" && bed.status !== "occupied" && bed.status !== "maintenance" && "bg-muted/30"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="flex items-center gap-2 font-semibold">
                                  <BedDouble className={cn("size-4", bed.status === "available" ? "text-success" : bed.status === "maintenance" ? "text-destructive" : "text-primary")} />
                                  {bed.label}
                                </p>
                                <Badge variant={meta.variant}>{meta.label}</Badge>
                              </div>

                              {bed.status === "occupied" && (
                                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                                  {p?.name ?? bed.patientId} · since {bed.occupiedSince ? dateLabel(bed.occupiedSince) : "—"}
                                  <PredictedDischargeChip
                                    occupiedSince={bed.occupiedSince}
                                    age={p ? ageFrom(p.dob) : undefined}
                                    comorbidityCount={p?.conditions?.length ?? 0}
                                  />
                                </p>
                              )}
                              {bed.status === "reserved" && (
                                <p className="mt-1.5 truncate text-xs text-muted-foreground">
                                  Reserved for {em ? caseName(em.id) : bed.reservedFor}
                                </p>
                              )}
                              {bed.status === "cleaning" && <p className="mt-1.5 text-xs text-muted-foreground">Turnaround in progress</p>}
                              {bed.status === "inspection" && <p className="mt-1.5 text-xs text-muted-foreground">Ready for inspection</p>}
                              {bed.status === "maintenance" && <p className="mt-1.5 text-xs text-muted-foreground">Out of service</p>}

                              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                {NEXT[bed.status].map((n) => (
                                  <Button
                                    key={n.action}
                                    size="sm"
                                    variant={n.action === "maintenance" ? "ghost" : "outline"}
                                    className="h-7 px-2 text-xs"
                                    disabled={busy}
                                    onClick={() => {
                                      setErr(null);
                                      setReason("");
                                      setActionBed({ bed, action: n.action, label: n.label });
                                    }}
                                  >
                                    {n.icon} {n.label}
                                  </Button>
                                ))}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-muted-foreground"
                                  onClick={() => setHistoryBed(bed)}
                                >
                                  <History className="size-3.5" /> History
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* Action dialog (reason required for maintenance/restore) */}
      <Dialog open={!!actionBed} onOpenChange={(o) => !o && setActionBed(null)}>
        <DialogContent
          title={`Bed ${actionBed?.bed.label ?? ""}`}
          description={`${actionBed?.label ?? ""} — currently ${actionBed ? statusMeta[actionBed.bed.status].label.toLowerCase() : ""}.`}
        >
          <div className="space-y-4">
            {actionBed && needReason(actionBed.action) && (
              <div className="space-y-1.5">
                <Label htmlFor="bed-reason">Reason *</Label>
                <Input id="bed-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this bed entering / leaving maintenance?" />
              </div>
            )}
            {err && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{err}</p>}
            <Button variant="gradient" className="w-full" disabled={busy} onClick={runAction}>
              Confirm — {actionBed?.label}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyBed} onOpenChange={(o) => !o && setHistoryBed(null)}>
        <DialogContent
          title={`Bed ${historyBed?.label ?? ""} — history`}
          description="Every status change, newest first."
          className="max-w-xl"
        >
          {(() => {
            const rows = bedAudit.filter((a) => a.bedId === historyBed?.id);
            if (rows.length === 0) {
              return <p className="text-sm text-muted-foreground">No changes recorded yet — this bed has never left its initial state.</p>;
            }
            return (
              <ol className="relative space-y-4 border-l pl-5">
                {rows.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[27px] mt-1 flex size-4 items-center justify-center rounded-full border-2 border-border bg-card" />
                    <p className="text-sm font-medium">
                      {statusMeta[a.fromStatus as BedStatus]?.label ?? a.fromStatus} → {statusMeta[a.toStatus as BedStatus]?.label ?? a.toStatus}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleString()} · {a.changedByName}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );

  function caseName(id: string) {
    const e = emergencies.find((x) => x.id === id);
    if (!e) return id;
    if (e.patientId) return `${id} · ${patients.find((p) => p.id === e.patientId)?.name ?? "patient"}`;
    const w = e.walkIn as { name?: string } | null;
    return `${id} · ${w?.name ?? "walk-in"}`;
  }
}
