"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children?: React.ReactNode }) {
  const theme = useStore((s) => s.theme);

  // sync theme class onto <html> once the persisted store has hydrated
  React.useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => {
      document.documentElement.classList.toggle("dark", useStore.getState().theme === "dark");
      document.documentElement.setAttribute("data-cp-boot", "1");
    });
    if (useStore.persist.hasHydrated()) {
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.setAttribute("data-cp-boot", "1");
    }
    return () => {
      unsub();
    };
  }, [theme]);

  return (
    <>
      {children ?? null}
      <Toaster />
    </>
  );
}
