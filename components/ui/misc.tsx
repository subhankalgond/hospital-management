import * as React from "react";
import { Badge } from "./primitives";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, InvoiceStatus, LabStatus } from "@/lib/types";

const apptMap: Record<AppointmentStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "sky" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  "no-show": { label: "No-show", variant: "warning" },
};

const invMap: Record<InvoiceStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  paid: { label: "Paid", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  overdue: { label: "Overdue", variant: "destructive" },
};

const labMap: Record<LabStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }> = {
  requested: { label: "Requested", variant: "secondary" },
  "in-progress": { label: "In progress", variant: "sky" },
  resulted: { label: "Resulted", variant: "success" },
};

export function ApptStatus({ status }: { status: AppointmentStatus }) {
  const v = apptMap[status];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const v = invMap[status];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export function LabStatusBadge({ status }: { status: LabStatus }) {
  const v = labMap[status];
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

export function PageHeader({
  title,
  description,
  kicker,
  actions,
  className,
}: {
  title: string;
  description?: string;
  kicker?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 pb-4 border-b border-border flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="space-y-1">
        {kicker && <p className="editorial-kicker">{kicker}</p>}
        <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

