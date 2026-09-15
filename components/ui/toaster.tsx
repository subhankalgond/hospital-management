"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lift"
            )}
          >
            <span className="mt-0.5">
              {t.variant === "success" ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : t.variant === "destructive" ? (
                <XCircle className="size-5 text-destructive" />
              ) : (
                <Info className="size-5 text-sky-500" />
              )}
            </span>
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.description && (
                <p className="text-sm text-muted-foreground">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 opacity-50 transition-opacity hover:bg-muted hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
