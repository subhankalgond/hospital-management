"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Account,
  Appointment,
  Doctor,
  Invoice,
  LabRequest,
  Patient,
  Prescription,
  Role,
  SignUpInput,
  Toast,
  Visit,
  VisitStatus,
  Ward,
} from "./types";
import { todayISO } from "./utils";

/* ───────────────────────── types ───────────────────────── */

export interface Slot {
  time: string;
  available: boolean;
}

interface NewAppointmentInput {
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  reason: string;
}

interface NewVisitInput {
  patientId: string;
  doctorId: string;
  department: string;
  date: string;
  diagnosis: string;
  notes: string;
  vitals: Visit["vitals"];
}

interface NewInvoiceInput {
  patientId: string;
  items: { label: string; amount: number }[];
  dueDays?: number;
}

interface NewRxInput {
  patientId: string;
  doctorId: string;
  items: Prescription["items"];
}

interface NewLabInput {
  patientId: string;
  doctorId: string;
  test: string;
}

/** resolved account + profile of whoever is signed in */
export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  avatarHue: number;
  patientId?: string;
  doctorId?: string;
  accountId: string;
}

interface State {
  /** lifecycle: idle → loading → ready | signed-out | error */
  bootState: "idle" | "loading" | "ready" | "signed-out" | "error";
  bootError: string | null;
  /** raw legacy localStorage snapshot (pre-server build), offered for import */
  legacySnapshot: Record<string, unknown> | null;
  legacyImportedOn: string | null;

  accounts: Account[];
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  prescriptions: Prescription[];
  visits: Visit[];
  invoices: Invoice[];
  labs: LabRequest[];
  wards: Ward[];
  session: SessionUser | null;
  theme: "light" | "dark";
  toasts: Toast[];

  // boot
  boot: () => Promise<void>;
  refresh: () => Promise<void>;

  // auth
  signUp: (input: SignUpInput) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  toggleTheme: () => void;

  // toasts
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  // appointments
  bookAppointment: (input: NewAppointmentInput) => Promise<Appointment | null>;
  rescheduleAppointment: (id: string, date: string, time: string) => Promise<void>;
  cancelAppointment: (id: string) => Promise<void>;
  confirmAppointment: (id: string) => Promise<void>;
  markNoShow: (id: string) => Promise<void>;
  setQueueStatus: (id: string, status: VisitStatus) => Promise<void>;

  // slots — computed from the server-synced appointments; the server is the
  // final conflict authority when the booking request lands.
  slotsFor: (doctorId: string, date: string) => Slot[];

  // visits & prescriptions
  addVisit: (input: NewVisitInput) => Promise<void>;
  addPrescription: (input: NewRxInput) => Promise<void>;

  // billing
  createInvoice: (input: NewInvoiceInput) => Promise<void>;
  payInvoice: (id: string) => Promise<void>;

  // labs
  createLab: (input: NewLabInput) => Promise<void>;
  setLabStatus: (id: string, status: LabRequest["status"], result?: string) => Promise<void>;

  // wards
  assignBed: (wardId: string, roomId: string, bedId: string, patientId: string) => Promise<void>;
  dischargeBed: (wardId: string, roomId: string, bedId: string) => Promise<void>;

  // doctors
  setDoctorOnCall: (doctorId: string, onCall: boolean) => Promise<void>;

  // patient profile
  updatePatientProfile: (
    patientId: string,
    patch: Partial<Pick<Patient, "phone" | "address" | "bloodGroup" | "emergencyContact" | "allergies" | "conditions" | "insurance">>
  ) => Promise<void>;

  // legacy import
  importLegacySnapshot: () => Promise<{ ok: boolean; error?: string }>;
  dismissLegacySnapshot: () => void;
}

/* ───────────────────────── helpers ───────────────────────── */

const API = {
  state: "/api/state",
  signUp: "/api/auth/signup",
  signIn: "/api/auth/signin",
  signOut: "/api/auth/signout",
  appointments: "/api/appointments",
  appointment: (id: string) => `/api/appointments/${id}`,
  visits: "/api/visits",
  prescriptions: "/api/prescriptions",
  invoices: "/api/invoices",
  payInvoice: (id: string) => `/api/invoices/${id}/pay`,
  labs: "/api/labs",
  lab: (id: string) => `/api/labs/${id}`,
  beds: "/api/beds",
  doctor: (id: string) => `/api/doctors/${id}`,
  patient: (id: string) => `/api/patients/${id}`,
  import: "/api/import",
} as const;

async function apiPost(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Cannot reach the server. Check your connection." } };
  }
}

async function apiPatch(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Cannot reach the server. Check your connection." } };
  }
}

/** One shared doctor-booking grid (matches the previous client behavior). */
const SLOT_TIMES = [
  "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:30", "18:00", "18:30",
];

const LEGACY_KEY = "carepulse-v1";
const IMPORT_FLAG = "carepulse-legacy-imported";

/** Read the pre-server localStorage snapshot once, then keep it for import. */
function readLegacySnapshot(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const state = parsed?.state ?? parsed;
    if (!state || typeof state !== "object") return null;
    const s = state as Record<string, unknown>;
    const hasRealAccounts = Array.isArray(s.accounts) && s.accounts.length > 0;
    if (!hasRealAccounts) {
      // demo-era or empty store: nothing worth importing
      window.localStorage.removeItem(LEGACY_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function applySnapshot(s: State, data: Record<string, unknown>): Partial<State> {
  return {
    accounts: (data.accounts ?? []) as State["accounts"],
    doctors: (data.doctors ?? []) as State["doctors"],
    patients: (data.patients ?? []) as State["patients"],
    appointments: (data.appointments ?? []) as State["appointments"],
    prescriptions: (data.prescriptions ?? []) as State["prescriptions"],
    visits: (data.visits ?? []) as State["visits"],
    invoices: (data.invoices ?? []) as State["invoices"],
    labs: (data.labs ?? []) as State["labs"],
    wards: (data.wards ?? []) as State["wards"],
    session: data.session as SessionUser | null,
  };
}

function sessionFor(account: { id: string; role: Role; name: string; email: string; patientId?: string; doctorId?: string }): SessionUser {
  return {
    id: account.id,
    role: account.role,
    name: account.name,
    email: account.email,
    avatarHue: (account.name.length * 37) % 360,
    patientId: account.patientId,
    doctorId: account.doctorId,
    accountId: account.id,
  };
}

/* ───────────────────────── store ───────────────────────── */

export const useStore = create<State>()((set, get) => ({
  bootState: "idle",
  bootError: null,
  legacySnapshot: null,
  legacyImportedOn: null,

  accounts: [],
  doctors: [],
  patients: [],
  appointments: [],
  prescriptions: [],
  visits: [],
  invoices: [],
  labs: [],
  wards: [],
  session: null,
  theme: typeof window !== "undefined" && window.localStorage.getItem("carepulse-theme") === "dark" ? "dark" : "light",
  toasts: [],

  // ───────────────── boot ─────────────────
  boot: async () => {
    const cur = get().bootState;
    if (cur === "loading" || cur === "ready") return;
    set({ bootState: "loading" });

    const legacy = readLegacySnapshot();
    const importedOn = typeof window !== "undefined" ? window.localStorage.getItem(IMPORT_FLAG) : null;

    const res = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
    if (!res) {
      set({ bootState: "error", bootError: "Cannot reach the server. Check your connection and try again." });
      return;
    }
    if (res.status === 401) {
      set({ bootState: "signed-out", bootError: null, legacySnapshot: legacy, legacyImportedOn: importedOn });
      return;
    }
    if (!res.ok) {
      set({ bootState: "error", bootError: `Server error (${res.status}). Please try again.` });
      return;
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") {
      set({ bootState: "error", bootError: "Server returned an unreadable response." });
      return;
    }
    const patch = applySnapshot(get(), data);
    set({ bootState: "ready", bootError: null, legacySnapshot: legacy, legacyImportedOn: importedOn, ...patch });
  },

  refresh: async () => {
    const res = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) return;
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (data) set(applySnapshot(get(), data));
  },

  // ───────────────── auth ─────────────────
  signUp: async (input) => {
    const res = await apiPost(API.signUp, input);
    if (!res.ok) return { ok: false, error: res.data?.error ?? "Sign up failed. Please try again." };

    const me = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
    if (!me || !me.ok) return { ok: false, error: "Account created but session could not start." };
    const data = (await me.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return { ok: false, error: "Account created but session could not start." };

    set({ bootState: "ready", ...applySnapshot(get(), data) });
    const name = (data.session as SessionUser | null)?.name ?? "there";
    get().toast({
      title: `Welcome to CarePulse, ${name.split(" ")[0]} 👋`,
      description:
        input.role === "doctor"
          ? "Your doctor profile is live — patients can now book you."
          : input.role === "admin"
            ? "Administrator account created."
            : "Your patient account is ready.",
      variant: "success",
    });
    return { ok: true };
  },

  signIn: async (email, password) => {
    const res = await apiPost(API.signIn, { email, password });
    if (!res.ok) return { ok: false, error: res.data?.error ?? "Sign in failed. Please try again." };

    const me = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
    if (!me || !me.ok) return { ok: false, error: "Signed in but data could not load." };
    const data = (await me.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return { ok: false, error: "Signed in but data could not load." };

    set({ bootState: "ready", ...applySnapshot(get(), data) });
    const name = (data.session as SessionUser | null)?.name ?? "there";
    get().toast({ title: `Welcome back, ${name.split(" ")[0]} 👋`, variant: "success" });
    return { ok: true };
  },

  logout: async () => {
    await apiPost(API.signOut);
    set({
      bootState: "signed-out",
      session: null,
      accounts: [],
      doctors: [],
      patients: [],
      appointments: [],
      prescriptions: [],
      visits: [],
      invoices: [],
      labs: [],
      wards: [],
    });
  },

  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "light" ? "dark" : "light";
      if (typeof window !== "undefined") window.localStorage.setItem("carepulse-theme", theme);
      return { theme };
    }),

  // ───────────────── toasts ─────────────────
  toast: (t) => {
    const id = nanoid(6);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  // ───────────────── appointments ─────────────────
  bookAppointment: async (input) => {
    const { doctors } = get();
    const res = await apiPost(API.appointments, input);
    if (!res.ok) {
      get().toast({
        title: "Could not book",
        description: res.data?.error ?? "Please try again.",
        variant: "destructive",
      });
      return null;
    }
    await get().refresh();
    const doctor = doctors.find((d) => d.id === input.doctorId);
    get().toast({
      title: "Appointment booked",
      description: `${doctor?.name ?? "Doctor"} · ${input.date} at ${input.time}.`,
      variant: "success",
    });
    return {
      id: res.data?.id ?? "A-",
      patientId: input.patientId,
      doctorId: input.doctorId,
      date: input.date,
      time: input.time,
      durationMin: 30,
      reason: input.reason,
      status: "confirmed",
      createdAt: Date.now(),
    };
  },

  rescheduleAppointment: async (id, date, time) => {
    const res = await apiPatch(API.appointment(id), { action: "reschedule", date, time });
    if (!res.ok) {
      get().toast({ title: "Could not reschedule", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Appointment rescheduled", description: `Moved to ${date} at ${time}.`, variant: "success" });
  },

  cancelAppointment: async (id) => {
    const res = await apiPatch(API.appointment(id), { action: "cancel" });
    if (!res.ok) {
      get().toast({ title: "Could not cancel", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Appointment cancelled" });
  },

  confirmAppointment: async (id) => {
    const res = await apiPatch(API.appointment(id), { action: "confirm" });
    if (!res.ok) {
      get().toast({ title: "Could not confirm", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Appointment confirmed", variant: "success" });
  },

  markNoShow: async (id) => {
    const res = await apiPatch(API.appointment(id), { action: "no-show" });
    if (!res.ok) {
      get().toast({ title: "Could not update", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Marked as no-show" });
  },

  setQueueStatus: async (id, status) => {
    // optimistic: doctor queue feels instant
    set((s) => ({
      appointments: s.appointments.map((a) =>
        a.id === id
          ? { ...a, queueStatus: status, status: status === "completed" ? "completed" : a.status }
          : a
      ),
    }));
    const res = await apiPatch(API.appointment(id), { action: "queue", queueStatus: status });
    if (!res.ok) {
      get().toast({ title: "Sync failed", description: res.data?.error, variant: "destructive" });
    }
    await get().refresh();
  },

  // ───────────────── slots ─────────────────
  slotsFor: (doctorId, date) => {
    const { appointments } = get();
    const taken = new Set(
      appointments
        .filter((a) => a.doctorId === doctorId && a.date === date && a.status !== "cancelled")
        .map((a) => a.time)
    );
    const isToday = date === todayISO();
    const now = new Date();
    return SLOT_TIMES.map((time) => {
      let available = !taken.has(time);
      if (isToday && available) {
        const [h, m] = time.split(":").map(Number);
        available = h * 60 + m > now.getHours() * 60 + now.getMinutes() + 30;
      }
      return { time, available };
    });
  },

  // ───────────────── visits & prescriptions ─────────────────
  addVisit: async (input) => {
    const res = await apiPost(API.visits, input);
    if (!res.ok) {
      get().toast({ title: "Could not record visit", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Visit recorded", description: input.diagnosis, variant: "success" });
  },

  addPrescription: async (input) => {
    const res = await apiPost(API.prescriptions, input);
    if (!res.ok) {
      get().toast({ title: "Could not issue prescription", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Prescription issued", description: `${input.items.length} medication(s).`, variant: "success" });
  },

  // ───────────────── billing ─────────────────
  createInvoice: async (input) => {
    const res = await apiPost(API.invoices, input);
    if (!res.ok) {
      get().toast({ title: "Could not create invoice", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: `Invoice ${res.data?.id ?? ""} created`, variant: "success" });
  },

  payInvoice: async (id) => {
    const res = await apiPost(API.payInvoice(id));
    if (!res.ok) {
      get().toast({ title: "Payment failed", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: `Payment received for ${id}`, variant: "success" });
  },

  // ───────────────── labs ─────────────────
  createLab: async (input) => {
    const res = await apiPost(API.labs, input);
    if (!res.ok) {
      get().toast({ title: "Could not request test", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Lab test requested", description: input.test, variant: "success" });
  },

  setLabStatus: async (id, status, result) => {
    const res = await apiPatch(API.lab(id), { status, result });
    if (!res.ok) {
      get().toast({ title: "Could not update lab", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: `Lab ${id} → ${status}`, variant: "success" });
  },

  // ───────────────── wards ─────────────────
  assignBed: async (wardId, roomId, bedId, patientId) => {
    const res = await apiPost(API.beds, { action: "assign", wardId, roomId, bedId, patientId });
    if (!res.ok) {
      get().toast({ title: "Could not assign bed", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Patient admitted", variant: "success" });
  },

  dischargeBed: async (wardId, roomId, bedId) => {
    const res = await apiPost(API.beds, { action: "discharge", wardId, roomId, bedId });
    if (!res.ok) {
      get().toast({ title: "Could not discharge", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Patient discharged" });
  },

  // ───────────────── doctors ─────────────────
  setDoctorOnCall: async (doctorId, onCall) => {
    set((s) => ({
      doctors: s.doctors.map((d) => (d.id === doctorId ? { ...d, onCall } : d)),
    }));
    const res = await apiPatch(API.doctor(doctorId), { onCall });
    if (!res.ok) {
      get().toast({ title: "Could not update", description: res.data?.error, variant: "destructive" });
    }
    await get().refresh();
  },

  // ───────────────── patient profile ─────────────────
  updatePatientProfile: async (patientId, patch) => {
    const res = await apiPatch(API.patient(patientId), patch);
    if (!res.ok) {
      get().toast({ title: "Could not update profile", description: res.data?.error, variant: "destructive" });
      return;
    }
    await get().refresh();
    get().toast({ title: "Profile updated", variant: "success" });
  },

  // ───────────────── legacy import ─────────────────
  importLegacySnapshot: async () => {
    const snap = get().legacySnapshot;
    if (!snap) return { ok: false, error: "No local data found to import." };
    const res = await apiPost(API.import, snap);
    if (!res.ok) return { ok: false, error: res.data?.error ?? "Import failed." };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(IMPORT_FLAG, todayISO());
      window.localStorage.removeItem(LEGACY_KEY);
    }
    set({ legacySnapshot: null, legacyImportedOn: todayISO() });
    await get().refresh();
    return { ok: true };
  },

  dismissLegacySnapshot: () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(IMPORT_FLAG, todayISO());
      window.localStorage.removeItem(LEGACY_KEY);
    }
    set({ legacySnapshot: null, legacyImportedOn: todayISO() });
  },
}));

/** selector helpers */
export const useSession = () => useStore((s) => s.session);
export const useToast = () => useStore((s) => s.toast);
