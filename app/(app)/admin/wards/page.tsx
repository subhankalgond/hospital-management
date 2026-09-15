"use client";

import * as React from "react";
import { BedDouble, DoorOpen, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, Label, Progress } from "@/components/ui/primitives";
import { Dialog, DialogContent, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/misc";
import { cn, dateLabel } from "@/lib/utils";

export default function AdminWards() {
  const wards = useStore((s) => s.wards);
  const patients = useStore((s) => s.patients);
  const assignBed = useStore((s) => s.assignBed);
  const dischargeBed = useStore((s) => s.dischargeBed);

  const [admitBed, setAdmitBed] = React.useState<{ wardId: string; roomId: string; bedId: string; label: string } | null>(null);
  const [selectedPatient, setSelectedPatient] = React.useState("");

  const admittedIds = new Set(wards.flatMap((w) => w.rooms.flatMap((r) => r.beds.flatMap((b) => (b.patientId ? [b.patientId] : [])))));
  const availablePatients = patients.filter((p) => !admittedIds.has(p.id));

  const totalBeds = wards.flatMap((w) => w.rooms.flatMap((r) => r.beds)).length;
  const occupiedBeds = wards.flatMap((w) => w.rooms.flatMap((r) => r.beds)).filter((b) => b.patientId).length;

  return (
    <>
      <PageHeader
        title="Wards & beds"
        description="Live occupancy across all wards."
        actions={
          <Badge variant="outline" className="text-sm">
            {occupiedBeds}/{totalBeds} beds occupied
          </Badge>
        }
      />

      <Tabs defaultValue={wards[0]?.id}>
        <TabsList>
          {wards.map((w) => (
            <TabsTrigger key={w.id} value={w.id}>{w.name}</TabsTrigger>
          ))}
        </TabsList>

        {wards.map((w) => {
          const beds = w.rooms.flatMap((r) => r.beds);
          const occ = beds.filter((b) => b.patientId).length;
          return (
            <TabsContent key={w.id} value={w.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <Progress value={(occ / beds.length) * 100} className="max-w-xs" />
                <span className="text-sm text-muted-foreground tabular-nums">
                  {occ}/{beds.length} · Floor {w.floor}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {w.rooms.map((room) => (
                  <Card key={room.id} className="overflow-hidden">
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DoorOpen className="size-4 text-primary" /> Room {room.label}
                      </CardTitle>
                      <Badge variant={room.type === "icu" ? "destructive" : room.type === "private" ? "sky" : "secondary"}>
                        {room.type}
                      </Badge>
                    </CardHeader>
                    <div className="space-y-2 px-5 pb-5">
                      {room.beds.map((bed) => {
                        const p = bed.patientId ? patients.find((x) => x.id === bed.patientId) : null;
                        return (
                          <div
                            key={bed.id}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-xl border p-3",
                              p ? "border-primary/25 bg-primary/5" : "bg-muted/30"
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={cn("rounded-lg p-2", p ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                                <BedDouble className="size-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">{bed.label}</p>
                                {p ? (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {p.name} · since {dateLabel(bed.since!)}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">Available</p>
                                )}
                              </div>
                            </div>
                            {p ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => dischargeBed(w.id, room.id, bed.id)}
                              >
                                <LogOut /> Discharge
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAdmitBed({ wardId: w.id, roomId: room.id, bedId: bed.id, label: bed.label });
                                  setSelectedPatient("");
                                }}
                              >
                                Admit
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Admit dialog */}
      <Dialog open={!!admitBed} onOpenChange={(o) => !o && setAdmitBed(null)}>
        <DialogContent
          title={`Admit patient — Bed ${admitBed?.label ?? ""}`}
          description="Assign an outpatient to this bed."
        >
          {availablePatients.length === 0 ? (
            <EmptyState emoji="📋" title="No unassigned patients" description="Everyone on the books already has a bed." />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Patient</Label>
                <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                  <SelectTrigger><SelectValue placeholder="Select patient to admit" /></SelectTrigger>
                  <SelectContent>
                    {availablePatients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.conditions.length ? p.conditions.join(", ") : "No chronic conditions"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="gradient"
                className="w-full"
                size="lg"
                disabled={!selectedPatient}
                onClick={() => {
                  if (!admitBed || !selectedPatient) return;
                  assignBed(admitBed.wardId, admitBed.roomId, admitBed.bedId, selectedPatient);
                  setAdmitBed(null);
                }}
              >
                Confirm admission
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
