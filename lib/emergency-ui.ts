/**
 * Shared Emergency Center UI helpers — status/priority presentation maps and
 * formatting utilities used by the emergency pages.
 */
import type { EmergencyCase, EmergencyPriority, EmergencyStatus } from "@/lib/types";

export const priorityBadge: Record<EmergencyPriority, "destructive" | "warning" | "sky" | "success"> = {
  CRITICAL: "destructive",
  URGENT: "warning",
  MODERATE: "sky",
  LOW: "success",
};

export const statusLabel: Record<EmergencyStatus, string> = {
  arrived: "Arrived",
  "triage-pending": "Triage pending",
  triaged: "Triaged",
  waiting: "Waiting",
  "in-assessment": "In assessment",
  "in-treatment": "In treatment",
  admitted: "Admitted",
  transferred: "Transferred",
  discharged: "Discharged",
  closed: "Closed",
};

export const statusVariant: Record<EmergencyStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "sky" | "violet" | "outline"> = {
  arrived: "secondary",
  "triage-pending": "warning",
  triaged: "sky",
  waiting: "default",
  "in-assessment": "sky",
  "in-treatment": "violet",
  admitted: "success",
  transferred: "outline",
  discharged: "success",
  closed: "outline",
};

/** Minutes between an ISO timestamp and now. */
export function minutesSince(iso: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60000));
}

export function casePatientName(c: EmergencyCase, patientName?: string) {
  if (c.patientId) return patientName ?? `Patient ${c.patientId}`;
  const w = c.walkIn as { name?: string } | null;
  return w?.name ?? "Walk-in patient";
}
