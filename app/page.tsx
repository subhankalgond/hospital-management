"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function IndexRedirect() {
  const router = useRouter();
  const bootState = useStore((s) => s.bootState);
  const bootError = useStore((s) => s.bootError);

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

  if (bootState === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-destructive/10 p-3 text-destructive">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-8 stroke-current"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Unable to connect to service</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {bootError || "The database or server is currently unreachable. Please verify database status."}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => useStore.getState().boot()}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Retry
            </button>
            <button
              onClick={() => {
                useStore.getState().logout();
                router.replace("/login");
              }}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

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
