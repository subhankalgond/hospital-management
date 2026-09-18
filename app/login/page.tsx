"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Role, SignUpInput } from "@/lib/types";
import { DEPARTMENT_NAMES, DEPARTMENTS, SHIFTS } from "@/lib/defaults";
import { Button, Input, Label, Card } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/overlays";

const CATEGORIES: {
  role: Role;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
}[] = [
  {
    role: "patient",
    title: "Patient",
    subtitle: "Book appointments, health records & billing",
    icon: UserRound,
    ring: "hover:ring-teal-400",
  },
  {
    role: "doctor",
    title: "Doctor",
    subtitle: "Add your qualifications & see patients",
    icon: Stethoscope,
    ring: "hover:ring-sky-400",
  },
  {
    role: "admin",
    title: "Administrator",
    subtitle: "Operations, wards, labs & billing",
    icon: ShieldCheck,
    ring: "hover:ring-violet-400",
  },
];

const ROLE_HOME: Record<Role, string> = {
  patient: "/patient",
  doctor: "/doctor",
  admin: "/admin",
};

type Mode = "signin" | "signup";
type Step = "category" | "form";

export default function LoginPage() {
  const session = useStore((s) => s.session);
  const bootState = useStore((s) => s.bootState);
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [nextPath, setNextPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNextPath(n);
    // Providers already boots once for the whole app; boot() is idempotent and
    // skips when a boot is in flight or ready, so this is only a safety net.
    useStore.getState().boot();
  }, []);

  const destinationFor = (role: Role) =>
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : ROLE_HOME[role];

  React.useEffect(() => {
    if (bootState === "ready" && session) {
      router.replace(destinationFor(session.role));
    }
  }, [bootState, session, router, nextPath]);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="gradient-brand relative hidden flex-col justify-between p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <HeartMark className="size-9" />
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
              { k: "3", v: "Account types" },
              { k: "10", v: "Departments" },
              { k: "24/7", v: "On-call coverage" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
                <p className="font-display text-2xl font-bold">{s.k}</p>
                <p className="mt-0.5 text-xs text-white/60">{s.v}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <p className="text-xs text-white/40">© 2026 CarePulse Health Systems</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <HeartMark className="size-8 text-primary" />
            <span className="font-display text-xl font-bold">CarePulse</span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {mode === "signin" ? (
              <motion.div
                key="signin"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <SignInForm
                  nextPath={nextPath}
                  onSwitch={() => setMode("signup")}
                />
              </motion.div>
            ) : (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <SignUpWizard
                  onBack={() => setMode("signin")}
                  onDone={(role) => router.replace(destinationFor(role))}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sign in ─────────────────────────── */

function SignInForm({ onSwitch }: { nextPath: string | null; onSwitch: () => void }) {
  const signIn = useStore((s) => s.signIn);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const res = await signIn(email, password);
    if (!res.ok) {
      setError(res.error ?? "Could not sign in.");
      setBusy(false);
    }
    // on success the session effect in the parent redirects
  }

  return (
    <>
      <h2 className="font-display text-3xl font-bold tracking-tight">Welcome back</h2>
      <p className="mt-2 text-muted-foreground">Sign in to your CarePulse account.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && <FormError message={error} />}

        <Button type="submit" variant="gradient" className="w-full" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <Divider />

      <p className="text-center text-sm text-muted-foreground">
        New to CarePulse?{" "}
        <button onClick={onSwitch} className="font-semibold text-primary hover:underline">
          Create an account
        </button>
      </p>
    </>
  );
}

/* ─────────────────────── Sign up wizard ─────────────────────── */

function SignUpWizard({ onBack, onDone }: { onBack: () => void; onDone: (role: Role) => void }) {
  const [step, setStep] = React.useState<Step>("category");
  const [role, setRole] = React.useState<Role | null>(null);

  if (step === "category" || !role) {
    return (
      <>
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </button>
        <h2 className="font-display text-3xl font-bold tracking-tight">Create your account</h2>
        <p className="mt-2 text-muted-foreground">First — what brings you to CarePulse?</p>

        <div className="mt-8 space-y-3">
          {CATEGORIES.map((r, i) => (
            <motion.button
              key={r.role}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i + 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => {
                setRole(r.role);
                setStep("form");
              }}
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
      </>
    );
  }

  return (
    <RoleSignUpForm
      role={role}
      onBack={() => setStep("category")}
      onDone={() => onDone(role)}
    />
  );
}

function RoleSignUpForm({
  role,
  onBack,
  onDone,
}: {
  role: Role;
  onBack: () => void;
  onDone: () => void;
}) {
  const signUp = useStore((s) => s.signUp);
  const meta = CATEGORIES.find((c) => c.role === role)!;

  // shared
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);

  // patient + doctor
  const [phone, setPhone] = React.useState("");
  // patient
  const [dob, setDob] = React.useState("");
  const [gender, setGender] = React.useState<"male" | "female" | "other">("female");
  // doctor
  const [qualification, setQualification] = React.useState("");
  const [licenseNo, setLicenseNo] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [specialty, setSpecialty] = React.useState("");
  const [experienceYears, setExperienceYears] = React.useState("");
  const [shift, setShift] = React.useState<(typeof SHIFTS)[number]>("morning");
  const [room, setRoom] = React.useState("");
  // admin
  const [accessCode, setAccessCode] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const specialtyOptions = DEPARTMENTS.find((d) => d.name === department)?.specialties ?? [];

  function validate(): string | null {
    if (!name.trim()) return "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    if (role === "patient" && (!phone.trim() || !dob)) return "Phone and date of birth are required.";
    if (role === "doctor") {
      if (!phone.trim()) return "Please add a contact phone number.";
      if (!qualification.trim()) return "Please add your medical qualification (e.g. MBBS, MD).";
      if (!licenseNo.trim()) return "Please add your medical license number.";
      if (!department) return "Please choose your department.";
      if (!specialty) return "Please choose your specialty.";
      if (experienceYears === "" || Number(experienceYears) < 0) return "Years of experience must be zero or more.";
    }
    if (role === "admin" && !accessCode.trim()) return "Administrator access code is required.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setBusy(true);

    const base = { name: name.trim(), email: email.trim(), password };
    let input: SignUpInput;
    if (role === "patient") {
      input = { ...base, role: "patient", phone: phone.trim(), dob, gender };
    } else if (role === "doctor") {
      input = {
        ...base,
        role: "doctor",
        phone: phone.trim(),
        qualification: qualification.trim(),
        licenseNo: licenseNo.trim(),
        department,
        specialty,
        experienceYears: Number(experienceYears),
        shift,
        room: room.trim() || undefined,
      };
    } else {
      input = { ...base, role: "admin", accessCode };
    }

    const res = await signUp(input);
    if (!res.ok) {
      setError(res.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <>
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Choose a different role
      </button>

      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <meta.icon className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Sign up as {meta.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {role === "patient"
              ? "Takes less than a minute."
              : role === "doctor"
                ? "Add your credentials so patients can find you."
                : "Protected by an access code."}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="su-name">Full name *</Label>
            <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jordan Miles" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-email">Email *</Label>
            <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="su-pw">Password *</Label>
            <div className="relative">
              <Input
                id="su-pw"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-pw2">Confirm password *</Label>
            <Input
              id="su-pw2"
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        {(role === "patient" || role === "doctor") && (
          <div className="space-y-1.5">
            <Label htmlFor="su-phone">Phone *</Label>
            <Input id="su-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" required />
          </div>
        )}

        {role === "patient" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="su-dob">Date of birth *</Label>
              <Input id="su-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as typeof gender)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {role === "doctor" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="su-qual">Qualification *</Label>
                <Input
                  id="su-qual"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. MBBS, MD (Cardiology)"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-license">Medical license no. *</Label>
                <Input id="su-license" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} placeholder="e.g. LIC-48211" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Department *</Label>
                <Select
                  value={department}
                  onValueChange={(v) => {
                    setDepartment(v);
                    setSpecialty("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENT_NAMES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Specialty *</Label>
                <Select value={specialty} onValueChange={setSpecialty} disabled={!department}>
                  <SelectTrigger>
                    <SelectValue placeholder={department ? "Choose specialty" : "Pick a department first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {specialtyOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="su-exp">Experience (years) *</Label>
                <Input
                  id="su-exp"
                  type="number"
                  min={0}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  placeholder="e.g. 8"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Shift</Label>
                <Select value={shift} onValueChange={(v) => setShift(v as typeof shift)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-room">Room (optional)</Label>
                <Input id="su-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. C-204" />
              </div>
            </div>
          </>
        )}

        {role === "admin" && (
          <div className="space-y-1.5">
            <Label htmlFor="su-code">Administrator access code *</Label>
            <Input
              id="su-code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="CAREPULSE-••••-••••"
              className="font-mono"
              required
            />
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3.5" />
              Administrator sign-up is protected by an access code. Ask your
              hospital administrator for it.
            </p>
          </div>
        )}

        {error && <FormError message={error} />}

        <Button type="submit" variant="gradient" className="w-full" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Creating account…
            </>
          ) : (
            <>
              <BadgeCheck /> Create {meta.title.toLowerCase()} account
            </>
          )}
        </Button>
      </form>
    </>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */

function FormError({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function HeartMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
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
  );
}
