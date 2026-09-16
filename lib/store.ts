"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Account,
  Appointment,
  Doctor,
  Invoice,
  LabRequest,
  Patient,
  Prescription,
  SignUpInput,
  Toast,
  Visit,
  VisitStatus,
  Ward,
} from "./types";
import { addDays, todayISO } from "./utils";
import { hashPassword, randomSalt, verifyPassword } from "./auth";
import { ADMIN_ACCESS_CODE, departmentFee, initialWards } from "./defaults";

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
  role: Account["role"];
  name: string;
  email: string;
  avatarHue: number;
  patientId?: string;
  doctorId?: string;
  accountId: string;
}

interface State {
  /** anchor for the daily date rebase (see rebaseSeedDates) */
  seededOn: string;
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

  // auth
  signUp: (input: SignUpInput) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  toggleTheme: () => void;

  // toasts
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  // appointments
  bookAppointment: (input: NewAppointmentInput) => Appointment | null;
  rescheduleAppointment: (id: string, date: string, time: string) => void;
  cancelAppointment: (id: string) => void;
  confirmAppointment: (id: string) => void;
  markNoShow: (id: string) => void;
  setQueueStatus: (id: string, status: VisitStatus) => void;

  // slots
  slotsFor: (doctorId: string, date: string) => Slot[];

  // visits & prescriptions
  addVisit: (input: NewVisitInput) => void;
  addPrescription: (input: NewRxInput) => void;

  // billing
  createInvoice: (input: NewInvoiceInput) => void;
  payInvoice: (id: string) => void;

  // labs
  createLab: (input: NewLabInput) => void;
  setLabStatus: (id: string, status: LabRequest["status"], result?: string) => void;

  // wards
  assignBed: (wardId: string, roomId: string, bedId: string, patientId: string) => void;
  dischargeBed: (wardId: string, roomId: string, bedId: string) => void;

  // doctors
  setDoctorOnCall: (doctorId: string, onCall: boolean) => void;

  // patient profile
  updatePatientProfile: (
    patientId: string,
    patch: Partial<Pick<Patient, "phone" | "address" | "bloodGroup" | "emergencyContact" | "allergies" | "conditions" | "insurance">>
  ) => void;
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Derive the lightweight session view from an account + current profiles. */
function sessionFor(account: Account, patients: Patient[], doctors: Doctor[]): SessionUser {
  const name =
    account.role === "patient"
      ? patients.find((p) => p.id === account.patientId)?.name ?? account.name
      : account.role === "doctor"
        ? doctors.find((d) => d.id === account.doctorId)?.name ?? account.name
        : account.name;
  return {
    id: account.id,
    role: account.role,
    name,
    email: account.email,
    avatarHue: (account.name.length * 37) % 360,
    patientId: account.patientId,
    doctorId: account.doctorId,
    accountId: account.id,
  };
}

function emailTaken(accounts: Account[], email: string) {
  return accounts.some((a) => a.email === email.trim().toLowerCase());
}

const PASSWORD_MIN = 8;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      seededOn: todayISO(),
      accounts: [],
      doctors: [],
      patients: [],
      appointments: [],
      prescriptions: [],
      visits: [],
      invoices: [],
      labs: [],
      wards: initialWards(),
      session: null,
      theme: "light",
      toasts: [],

      // ───────────────────────── auth ─────────────────────────
      signUp: async (input) => {
        const state = get();
        const email = input.email.trim().toLowerCase();
        const name = input.name.trim();

        if (!name || !email || !input.password) {
          return { ok: false, error: "Please fill in all required fields." };
        }
        if (input.password.length < PASSWORD_MIN) {
          return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
        }
        if (emailTaken(state.accounts, email)) {
          return { ok: false, error: "An account with this email already exists. Try signing in instead." };
        }

        if (input.role === "admin" && input.accessCode.trim() !== ADMIN_ACCESS_CODE) {
          return { ok: false, error: "Invalid administrator access code." };
        }

        const salt = randomSalt();
        const passwordHash = await hashPassword(input.password, salt);
        const createdAt = todayISO();
        const accountId = "u-" + nanoid(8);

        let account: Account;

        if (input.role === "patient") {
          if (!input.phone.trim() || !input.dob) {
            return { ok: false, error: "Phone and date of birth are required." };
          }
          const patientId = "P-" + nanoid(6).toUpperCase();
          const patient: Patient = {
            id: patientId,
            name,
            email,
            phone: input.phone.trim(),
            dob: input.dob,
            gender: input.gender,
            bloodGroup: "",
            address: "",
            emergencyContact: { name: "", phone: "", relation: "" },
            allergies: [],
            conditions: [],
            immunizations: [],
            insurance: { provider: "", number: "" },
          };
          account = { id: accountId, role: "patient", name, email, passwordHash, salt, createdAt, patientId };
          set({ patients: [...state.patients, patient], accounts: [...state.accounts, account] });
        } else if (input.role === "doctor") {
          if (!input.phone.trim() || !input.qualification.trim() || !input.licenseNo.trim()) {
            return { ok: false, error: "Qualification, license number and phone are required for doctors." };
          }
          if (!input.department || !input.specialty) {
            return { ok: false, error: "Please choose a department and specialty." };
          }
          if (!(input.experienceYears >= 0)) {
            return { ok: false, error: "Years of experience must be zero or more." };
          }
          const doctorId = "D-" + nanoid(6).toUpperCase();
          const doctor: Doctor = {
            id: doctorId,
            name,
            qualification: input.qualification.trim(),
            licenseNo: input.licenseNo.trim(),
            specialty: input.specialty,
            department: input.department,
            email,
            phone: input.phone.trim(),
            room: input.room?.trim() || "—",
            experienceYears: input.experienceYears,
            rating: 0,
            onCall: false,
            shift: input.shift,
          };
          account = { id: accountId, role: "doctor", name, email, passwordHash, salt, createdAt, doctorId };
          set({ doctors: [...state.doctors, doctor], accounts: [...state.accounts, account] });
        } else {
          account = { id: accountId, role: "admin", name, email, passwordHash, salt, createdAt };
          set({ accounts: [...state.accounts, account] });
        }

        set({ session: sessionFor(account, get().patients, get().doctors) });
        toastSafe(get, {
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
        const state = get();
        const account = state.accounts.find((a) => a.email === email.trim().toLowerCase());
        if (!account) {
          return { ok: false, error: "No account found with this email." };
        }
        const valid = await verifyPassword(password, account.salt, account.passwordHash);
        if (!valid) {
          return { ok: false, error: "Incorrect password. Please try again." };
        }
        set({ session: sessionFor(account, state.patients, state.doctors) });
        toastSafe(get, {
          title: `Welcome back, ${account.name.split(" ")[0]} 👋`,
          variant: "success",
        });
        return { ok: true };
      },

      logout: () => set({ session: null }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

      toast: (t) => {
        const id = nanoid(6);
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

      // ─────────────────── appointments ───────────────────
      bookAppointment: (input) => {
        const { appointments, doctors, toast } = get();
        const taken = appointments.some(
          (a) =>
            a.doctorId === input.doctorId &&
            a.date === input.date &&
            a.time === input.time &&
            a.status !== "cancelled"
        );
        if (taken) {
          toast({ title: "Slot just got taken", description: "Please pick another time.", variant: "destructive" });
          return null;
        }
        const doctor = doctors.find((d) => d.id === input.doctorId);
        const appt: Appointment = {
          id: "A-" + nanoid(6).toUpperCase(),
          patientId: input.patientId,
          doctorId: input.doctorId,
          date: input.date,
          time: input.time,
          durationMin: 30,
          reason: input.reason,
          status: "confirmed",
          createdAt: Date.now(),
        };
        set({ appointments: [...appointments, appt] });

        // auto-generate the consultation invoice from the department fee
        const fee = doctor ? departmentFee(doctor.department) : 150;
        const inv: Invoice = {
          id: "INV-" + nanoid(6).toUpperCase(),
          patientId: input.patientId,
          appointmentId: appt.id,
          date: input.date,
          dueDate: addDaysISO(14),
          items: [{ label: `${doctor?.department ?? "General"} consultation`, amount: fee }],
          status: "pending",
        };
        set((s) => ({ invoices: [...s.invoices, inv] }));
        toast({
          title: "Appointment booked",
          description: `${doctor?.name ?? "Doctor"} · ${input.date} at ${input.time}. Invoice ${inv.id} created.`,
          variant: "success",
        });
        return appt;
      },

      rescheduleAppointment: (id, date, time) => {
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, date, time } : a)),
        }));
        get().toast({ title: "Appointment rescheduled", description: `Moved to ${date} at ${time}.`, variant: "success" });
      },

      cancelAppointment: (id) => {
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)),
        }));
        get().toast({ title: "Appointment cancelled" });
      },

      confirmAppointment: (id) => {
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "confirmed" } : a)),
        }));
        get().toast({ title: "Appointment confirmed", variant: "success" });
      },

      markNoShow: (id) => {
        set((s) => ({
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "no-show" } : a)),
        }));
        get().toast({ title: "Marked as no-show" });
      },

      setQueueStatus: (id, status) => {
        set((s) => ({
          appointments: s.appointments.map((a) =>
            a.id === id
              ? {
                  ...a,
                  queueStatus: status,
                  status: status === "completed" ? "completed" : a.status,
                }
              : a
          ),
        }));
      },

      slotsFor: (doctorId, date) => {
        const { appointments } = get();
        const all = [
          "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
          "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
          "17:30", "18:00", "18:30",
        ];
        const taken = new Set(
          appointments
            .filter((a) => a.doctorId === doctorId && a.date === date && a.status !== "cancelled")
            .map((a) => a.time)
        );
        const isToday = date === todayISO();
        const now = new Date();
        return all.map((time) => {
          let available = !taken.has(time);
          if (isToday && available) {
            const [h, m] = time.split(":").map(Number);
            available = h * 60 + m > now.getHours() * 60 + now.getMinutes() + 30;
          }
          return { time, available };
        });
      },

      // ─────────────── visits & prescriptions ───────────────
      addVisit: (input) => {
        const visit: Visit = { id: "V-" + nanoid(6).toUpperCase(), ...input };
        set((s) => ({ visits: [visit, ...s.visits] }));
        get().toast({ title: "Visit recorded", description: input.diagnosis, variant: "success" });
      },

      addPrescription: (input) => {
        const rx: Prescription = {
          id: "RX-" + nanoid(6).toUpperCase(),
          date: todayISO(),
          active: true,
          ...input,
        };
        set((s) => ({ prescriptions: [rx, ...s.prescriptions] }));
        get().toast({ title: "Prescription issued", description: `${input.items.length} medication(s).`, variant: "success" });
      },

      // ───────────────────── billing ─────────────────────
      createInvoice: (input) => {
        const inv: Invoice = {
          id: "INV-" + nanoid(6).toUpperCase(),
          date: todayISO(),
          dueDate: addDaysISO(input.dueDays ?? 14),
          status: "pending",
          ...input,
        };
        set((s) => ({ invoices: [inv, ...s.invoices] }));
        get().toast({ title: `Invoice ${inv.id} created`, variant: "success" });
      },

      payInvoice: (id) => {
        set((s) => ({
          invoices: s.invoices.map((i) =>
            i.id === id ? { ...i, status: "paid" as const, paidAt: todayISO() } : i
          ),
        }));
        get().toast({ title: `Payment received for ${id}`, variant: "success" });
      },

      // ───────────────────── labs ─────────────────────
      createLab: (input) => {
        const lab: LabRequest = {
          id: "LAB-" + nanoid(4).toUpperCase(),
          requestedOn: todayISO(),
          status: "requested",
          ...input,
        };
        set((s) => ({ labs: [lab, ...s.labs] }));
        get().toast({ title: "Lab test requested", description: input.test, variant: "success" });
      },

      setLabStatus: (id, status, result) => {
        set((s) => ({
          labs: s.labs.map((l) => (l.id === id ? { ...l, status, result: result ?? l.result } : l)),
        }));
        get().toast({ title: `Lab ${id} → ${status}`, variant: "success" });
      },

      // ───────────────────── wards ─────────────────────
      assignBed: (wardId, roomId, bedId, patientId) => {
        set((s) => ({
          wards: s.wards.map((w) =>
            w.id !== wardId
              ? w
              : {
                  ...w,
                  rooms: w.rooms.map((r) =>
                    r.id !== roomId
                      ? r
                      : {
                          ...r,
                          beds: r.beds.map((b) =>
                            b.id === bedId ? { ...b, patientId, since: todayISO() } : b
                          ),
                        },
                      ),
                }
          ),
        }));
        get().toast({ title: "Patient admitted", variant: "success" });
      },

      dischargeBed: (wardId, roomId, bedId) => {
        set((s) => ({
          wards: s.wards.map((w) =>
            w.id !== wardId
              ? w
              : {
                  ...w,
                  rooms: w.rooms.map((r) =>
                    r.id !== roomId
                      ? r
                      : {
                          ...r,
                          beds: r.beds.map((b) =>
                            b.id === bedId ? { ...b, patientId: undefined, since: undefined } : b
                          ),
                        },
                      ),
                }
          ),
        }));
        get().toast({ title: "Patient discharged" });
      },

      // ───────────────────── doctors ─────────────────────
      setDoctorOnCall: (doctorId, onCall) => {
        set((s) => ({
          doctors: s.doctors.map((d) => (d.id === doctorId ? { ...d, onCall } : d)),
        }));
      },

      // ─────────────── patient profile ───────────────
      updatePatientProfile: (patientId, patch) => {
        set((s) => ({
          patients: s.patients.map((p) => (p.id === patientId ? { ...p, ...patch } : p)),
        }));
        get().toast({ title: "Profile updated", variant: "success" });
      },
    }),
    {
      name: "carepulse-v1",
      version: 2,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage)
      ),
      migrate: (persisted) => persisted as State,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        // Legacy/demo stores (no real accounts) are discarded entirely except
        // the theme, so every user starts from a clean, real-accounts slate.
        if (!Array.isArray(p.accounts)) {
          return { ...current, theme: (p.theme as State["theme"]) ?? current.theme };
        }
        return { ...current, ...(p as unknown as Partial<State>) };
      },
      partialize: (s) => ({
        seededOn: s.seededOn,
        accounts: s.accounts,
        doctors: s.doctors,
        patients: s.patients,
        appointments: s.appointments,
        prescriptions: s.prescriptions,
        visits: s.visits,
        invoices: s.invoices,
        labs: s.labs,
        wards: s.wards,
        session: s.session,
        theme: s.theme,
      }),
    }
  )
);

/** toast from outside the store creator without tripping on `set` timing */
function toastSafe(get: () => State, t: Omit<Toast, "id">) {
  get().toast(t);
}

/** selector helpers */
export const useSession = () => useStore((s) => s.session);
export const useToast = () => useStore((s) => s.toast);
