"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Lock, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { Button, Input, Label, Card } from "@/components/ui/primitives";

const ROLES: {
  role: Role;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
}[] = [
  {
    role: "patient",
    title: "Patient",
    subtitle: "Olivia Bennett · appointments, records & billing",
    icon: UserRound,
    ring: "hover:ring-teal-400",
  },
  {
    role: "doctor",
    title: "Doctor",
    subtitle: "Dr. Sarah Chen · queue, charts & prescriptions",
    icon: Stethoscope,
    ring: "hover:ring-sky-400",
  },
  {
    role: "admin",
    title: "Administrator",
    subtitle: "Marcus Webb · operations, wards & billing",
    icon: ShieldCheck,
    ring: "hover:ring-violet-400",
  },
];

export default function LoginPage() {
  const loginAsRole = useStore((s) => s.loginAsRole);
  const session = useStore((s) => s.session);
  const router = useRouter();
  const [password, setPassword] = React.useState("demo1234");
  const [booted, setBooted] = React.useState(false);
  const [nextPath, setNextPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNextPath(n);
    if (!useStore.persist.hasHydrated()) {
      const unsub = useStore.persist.onFinishHydration(() => setBooted(true));
      return () => unsub();
    }
    setBooted(true);
  }, []);

  const destinationFor = (role: Role) =>
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : `/${role}`;

  React.useEffect(() => {
    if (booted && session) {
      router.replace(destinationFor(session.role));
    }
  }, [booted, session, router, nextPath]);

  function enter(role: Role) {
    loginAsRole(role);
    router.push(destinationFor(role));
    useStore.getState().toast({
      title: "Welcome back 👋",
      description: `Signed in as ${
        role === "patient" ? "Olivia Bennett (patient)" : role === "doctor" ? "Dr. Sarah Chen (doctor)" : "Marcus Webb (admin)"
      }.`,
      variant: "success",
      });
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="gradient-brand relative hidden flex-col justify-between p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" className="size-9" aria-hidden>
            <path
              d="M12 21s-7.5-4.7-9.5-9.2C.9 8 2.6 4.5 6 4.1c2-.3 3.9.7 6 3 2.1-2.3 4-3.3 6-3 3.4.4 5.1 3.9 3.5 7.7C19.5 16.3 12 21 12 21"
              fill="currentColor"
              opacity=".2"
            />
            <path
              d="M2.5 11.5h4l1.7-3.4 2.6 6.4 2.4-4.6 1.4 2.6h6.9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
          />
          </svg>
          <span className="font-display text-xl font-bold">CarePulse</span>
        </div>

        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-balance"
          >
            The heartbeat of modern care.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-md text-lg text-white/70"
          >
            One platform for scheduling, records, wards, labs and billing — for patients,
            clinicians and administrators.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-10 grid grid-cols-3 gap-3"
          >
            {[
              { k: "12", v: "Doctors on staff" },
              { k: "6", v: "Departments" },
              { k: "24/7", v: "On-call coverage" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
                <p className="font-display text-2xl font-bold">{s.k}</p>
                <p className="mt-0.5 text-xs text-white/60">{s.v}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <p className="text-xs text-white/40">© 2026 CarePulse Health Systems · Demo environment</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <svg viewBox="0 0 24 24" fill="none" className="size-8 text-primary" aria-hidden>
              <path
                d="M12 21s-7.5-4.7-9.5-9.2C.9 8 2.6 4.5 6 4.1c2-.3 3.9.7 6 3 2.1-2.3 4-3.3 6-3 3.4.4 5.1 3.9 3.5 7.7C19.5 16.3 12 21 12 21"
                fill="currentColor"
                opacity=".2"
              />
              <path
                d="M2.5 11.5h4l1.7-3.4 2.6 6.4 2.4-4.6 1.4 2.6h6.9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-display text-xl font-bold">CarePulse</span>
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-2 text-muted-foreground">
            Choose a demo account to explore each experience instantly.
          </p>

          <div className="mt-8 space-y-3">
            {ROLES.map((r, i) => (
              <motion.button
                key={r.role}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i + 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => enter(r.role)}
                className={`group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${r.ring}`}
              >
                <span className="rounded-xl bg-primary/10 p-3 text-primary transition-transform group-hover:scale-110">
                  <r.icon className="size-6" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{r.title}</span>
                  <span className="block text-sm text-muted-foreground">{r.subtitle}</span>
                </span>
                <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </motion.button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with credentials
            <span className="h-px flex-1 bg-border" />
          </div>

          <Card className="p-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@carepulse.org" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button variant="gradient" className="w-full" size="lg" onClick={() => enter("patient")}>
                Sign in
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Demo only — any credentials sign you in as the patient view.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
