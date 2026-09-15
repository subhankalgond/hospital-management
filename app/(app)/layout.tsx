"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  ClipboardPlus,
  CreditCard,
  FileHeart,
  FlaskConical,
  Home,
  LogOut,
  Menu,
  Stethoscope,
  Users,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { Avatar } from "@/components/ui/primitives";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: "/patient", label: "Overview", icon: Home, roles: ["patient"] },
  { href: "/patient/appointments", label: "Appointments", icon: CalendarDays, roles: ["patient"] },
  { href: "/patient/records", label: "Health records", icon: FileHeart, roles: ["patient"] },
  { href: "/patient/billing", label: "Billing", icon: Wallet, roles: ["patient"] },
  { href: "/patient/profile", label: "Profile", icon: UserRound, roles: ["patient"] },

  { href: "/doctor", label: "Today's queue", icon: Activity, roles: ["doctor"] },
  { href: "/doctor/patients", label: "Patients", icon: Users, roles: ["doctor"] },
  { href: "/doctor/schedule", label: "Schedule", icon: CalendarDays, roles: ["doctor"] },

  { href: "/admin", label: "Dashboard", icon: Home, roles: ["admin"] },
  { href: "/admin/appointments", label: "Appointments", icon: CalendarDays, roles: ["admin"] },
  { href: "/admin/staff", label: "Staff & doctors", icon: Stethoscope, roles: ["admin"] },
  { href: "/admin/wards", label: "Wards & beds", icon: ClipboardPlus, roles: ["admin"] },
  { href: "/admin/billing", label: "Billing", icon: CreditCard, roles: ["admin"] },
  { href: "/admin/labs", label: "Laboratory", icon: FlaskConical, roles: ["admin"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const session = useStore((s) => s.session);
  const logout = useStore((s) => s.logout);
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = usePathname();

  // Track persist hydration with local state: hasHydrated() alone never
  // triggers a re-render, so the splash could hang when the persisted state
  // matches the initial state. Starting at `false` also keeps the first
  // client render identical to the SSR output (no hydration mismatch).
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Guard both auth and role/path mismatch; preserve the deep link across
  // the login bounce via ?next=.
  const role = session?.role;
  const pathAllowed = React.useMemo(() => {
    const allowed = NAV.filter((n) => n.roles.includes(role ?? "patient"));
    return allowed.some((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  }, [role, pathname]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!pathAllowed) {
      router.replace(`/${session.role}`);
    }
  }, [hydrated, session, pathAllowed, pathname, router]);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (!hydrated || !session || !pathAllowed) {
    // Splash also covers the role-mismatch case: children must never render
    // for a session whose role can't access this path (e.g. a doctor deep
    // link opened by an admin) — the effect above is redirecting right now.
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <HeartPulseMark className="size-10 animate-pulse-soft text-primary" />
          <p className="text-sm text-muted-foreground">Loading CarePulse…</p>
        </div>
      </div>
    );
  }

  const items = NAV.filter((n) => n.roles.includes(session.role));
  const isPatient = session.role === "patient";

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex">
        <SidebarContent items={items} pathname={pathname} role={session.role} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-card shadow-lift">
            <button
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <SidebarContent items={items} pathname={pathname} role={session.role} />
          </aside>
        </div>
      )}

      {/* Main column — offset for the fixed sidebar at lg+ for every role */}
      <div className="flex min-h-dvh flex-col lg:pl-64">
        {/* Topbar */}
        <header
          className={cn(
            "sticky top-0 z-30 flex h-16 items-center gap-3 border-b glass px-4 sm:px-6",
            isPatient && "lg:px-10"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <OnCallPill role={session.role} />
            <ThemeToggle />
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <div className="flex items-center gap-2.5">
              <Avatar name={session.name} className="size-9" />
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-semibold">{session.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{session.role}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </header>

        <main className={cn("px-4 py-6 sm:px-6 lg:px-10", isPatient && "pb-24 lg:pb-6")}>
          <div className="mx-auto w-full max-w-6xl animate-fade-up">{children}</div>
        </main>
      </div>

      {/* Patient mobile bottom nav */}
      {isPatient && <BottomNav pathname={pathname} />}
    </div>
  );
}

function SidebarContent({
  items,
  pathname,
  role,
}: {
  items: NavItem[];
  pathname: string;
  role: Role;
}) {
  const roleTag = role === "admin" ? "Admin console" : role === "doctor" ? "Clinician workspace" : "Patient portal";
  return (
    <>
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>
      <div className="mx-4 mb-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
        {roleTag}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className={cn("size-[18px] transition-transform group-hover:scale-110")} />
              {item.label}
              {active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        CarePulse v1.0 · demo build
      </div>
    </>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const items = NAV.filter((n) => n.roles.includes("patient")).filter((n) =>
    ["/patient", "/patient/appointments", "/patient/records", "/patient/billing"].includes(n.href)
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon className="size-5" />
            {item.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}

function OnCallPill({ role }: { role: Role }) {
  const doctors = useStore((s) => s.doctors);
  if (role !== "admin") return null;
  const onCall = doctors.filter((d) => d.onCall).length;
  return (
    <span className="mr-1 hidden items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success md:inline-flex">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {onCall} on call
    </span>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CarePulse home">
      <HeartPulseMark className="size-8 text-primary" />
      <span className="font-display text-lg font-bold tracking-tight">CarePulse</span>
    </Link>
  );
}

function HeartPulseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
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
  );
}
