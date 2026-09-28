"use client";

import * as React from "react";

/**
 * ML-powered chip on occupied beds: predicts the remaining stay and shows the
 * expected discharge date, using the trained LOS model via /api/ml/los
 * (browser-safe — the model JSON never ships to the client).
 */
export function PredictedDischargeChip({
  occupiedSince,
  age,
  comorbidityCount,
}: {
  occupiedSince?: string;
  age?: number;
  comorbidityCount?: number;
}) {
  const [prediction, setPrediction] = React.useState<{ daysRemaining: number; date: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!occupiedSince) return;
    (async () => {
      try {
        const res = await fetch("/api/ml/los", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age: age ?? 45,
            gender: "other",
            priority: "MODERATE",
            emergency: false,
            comorbidityCount: comorbidityCount ?? 0,
            admissionIcu: false,
            wardType: "semi-private",
            nightAdmission: false,
            weekendAdmission: false,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const since = new Date(occupiedSince);
        const daysIn = Math.max(0, (Date.now() - since.getTime()) / 86_400_000);
        setPrediction({
          daysRemaining: Math.max(0, data.losDays - daysIn),
          date: data.expectedDischargeDate,
        });
      } catch {
        /* chip is best-effort decoration */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [occupiedSince, age, comorbidityCount]);

  if (!prediction) return null;
  return (
    <span className="ml-1 inline-flex items-center whitespace-nowrap rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
      est. free {prediction.date} (~{Math.ceil(prediction.daysRemaining)}d left)
    </span>
  );
}
