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
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
