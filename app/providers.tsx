"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children?: React.ReactNode }) {
  const theme = useStore((s) => s.theme);

  // Apply the theme class as soon as the store mounts; the theme preference
  // lives in localStorage (the only client-persisted setting).
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Kick off the server boot (session + data snapshot) once.
  React.useEffect(() => {
    useStore.getState().boot();
  }, []);

  // Cross-panel sync: gentle polling keeps the pharmacy / laboratory / billing
  // queues current without a websocket dependency. It pauses when the tab is
  // hidden, and failures are silent — the next poll (or manual refresh) wins.
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && useStore.getState().bootState === "ready") {
        useStore.getState().refresh();
      }
    };
    const iv = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return (
    <>
      {children ?? null}
      <Toaster />
    </>
  );
}
