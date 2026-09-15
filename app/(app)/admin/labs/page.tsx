"use client";

import * as React from "react";
import { FlaskConical, Play, FileCheck2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, EmptyState, Input, Label } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { PageHeader, LabStatusBadge } from "@/components/ui/misc";
import { dateLabel } from "@/lib/utils";
import type { LabRequest } from "@/lib/types";

export default function AdminLabs() {
  const labs = useStore((s) => s.labs);
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const setLabStatus = useStore((s) => s.setLabStatus);

  const [resulting, setResulting] = React.useState<LabRequest | null>(null);
  const [resultText, setResultText] = React.useState("");

  const requested = labs.filter((l) => l.status === "requested");
  const inProgress = labs.filter((l) => l.status === "in-progress");
  const resulted = labs.filter((l) => l.status === "resulted");

  return (
    <>
      <PageHeader
        title="Laboratory"
        description="Test requests pipeline — from order to result."
        actions={
          <Badge variant="outline" className="text-sm">
            {requested.length + inProgress.length} open · {resulted.length} resulted
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Column title="Requested" tone="secondary" count={requested.length}>
          {requested.map((l) => (
            <LabCard key={l.id} lab={l} onAdvance={() => setLabStatus(l.id, "in-progress")} advanceLabel={<><Play /> Start test</>} />
          ))}
        </Column>

        <Column title="In progress" tone="sky" count={inProgress.length}>
          {inProgress.map((l) => (
            <LabCard
              key={l.id}
              lab={l}
              advanceLabel={<><FileCheck2 /> Enter result</>}
              onAdvance={() => {
                setResulting(l);
                setResultText("");
              }}
            />
          ))}
        </Column>

        <Column title="Resulted" tone="success" count={resulted.length}>
          {resulted.map((l) => (
            <LabCard key={l.id} lab={l} />
          ))}
        </Column>
      </div>

      {labs.length === 0 && <EmptyState emoji="🧪" title="No lab requests" />}

      <Dialog open={!!resulting} onOpenChange={(o) => !o && setResulting(null)}>
        <DialogContent
          title={`Enter result — ${resulting?.test ?? ""}`}
          description="Record the findings for this test."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="result">Result summary</Label>
              <Input
                id="result"
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="e.g. Hb 13.2 g/dL — normal range"
              />
            </div>
            <Button
              variant="gradient"
              className="w-full"
              size="lg"
              disabled={!resultText.trim()}
              onClick={() => {
                if (!resulting) return;
                setLabStatus(resulting.id, "resulted", resultText.trim());
                setResulting(null);
              }}
            >
              Save result
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: "secondary" | "sky" | "success";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Badge variant={tone}>{count}</Badge>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LabCard({
  lab,
  onAdvance,
  advanceLabel,
}: {
  lab: LabRequest;
  onAdvance?: () => void;
  advanceLabel?: React.ReactNode;
}) {
  const patients = useStore((s) => s.patients);
  const doctors = useStore((s) => s.doctors);
  const p = patients.find((x) => x.id === lab.patientId);
  const d = doctors.find((x) => x.id === lab.doctorId);

  return (
    <Card className="p-4 transition-all hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-primary" />
          <p className="text-sm font-semibold tabular-nums">{lab.id}</p>
        </div>
        <LabStatusBadge status={lab.status} />
      </div>
      <p className="mt-2 font-medium">{lab.test}</p>
      <p className="text-sm text-muted-foreground">
        {p?.name} · ordered by {d?.name} · {dateLabel(lab.requestedOn)}
      </p>
      {lab.result && (
        <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{lab.result}</p>
      )}
      {onAdvance && (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={onAdvance}>
          {advanceLabel}
        </Button>
      )}
    </Card>
  );
}
