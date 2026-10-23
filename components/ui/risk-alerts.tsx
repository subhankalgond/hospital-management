import * as React from "react";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { RiskAlert } from "@/lib/risk-alerts";

/**
 * Rendered risk-alert list for clinical surfaces. Critical warnings are
 * visually separated from routine info; identical alerts are de-duplicated
 * upstream by stable ids so the list never "piles up" verbatim repeats.
 */
export function RiskAlertList({ alerts }: { alerts: RiskAlert[] }) {
  if (alerts.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2" role="alert">
      {alerts.map((a) => {
        const critical = a.severity === "critical";
        const warn = a.severity === "warning";
        return (
          <div
            key={a.id}
            className={
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm " +
              (critical
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : warn
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-border bg-muted/40 text-foreground")
            }
          >
            {critical ? <AlertOctagon className="mt-0.5 size-4 shrink-0" /> : warn ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs opacity-80">{a.reason}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider opacity-60">{a.rule}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
