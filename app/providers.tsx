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

  return (
    <>
      {children ?? null}
      <Toaster />
    </>
  );
}
