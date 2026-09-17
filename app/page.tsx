"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function IndexRedirect() {
  const router = useRouter();
  const bootState = useStore((s) => s.bootState);

  React.useEffect(() => {
    useStore.getState().boot();
  }, []);

  React.useEffect(() => {
    if (bootState === "signed-out") {
      router.replace("/login");
      return;
    }
    if (bootState === "ready") {
      const s = useStore.getState().session;
      router.replace(s ? `/${s.role}` : "/login");
    }
  }, [bootState, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-12 animate-pulse-soft text-primary" aria-hidden>
          <path
            d="M12 21s-7.5-4.7-9.5-9.2C.9 8 2.6 4.5 6 4.1c2-.3 3.9.7 6 3 2.1-2.3 4-3.3 6-3 3.4.4 5.1 3.9 3.5 7.7C19.5 16.3 12 21 12 21z"
            fill="currentColor"
            opacity=".18"
          />
          <path
            d="M2.5 11.5h4l1.7-3.4 2.6 6.4 2.4-4.6 1.4 2.6h6.9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-muted-foreground">Taking your pulse…</p>
      </div>
    </div>
  );
}
