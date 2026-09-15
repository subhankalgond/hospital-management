"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type {
  Appointment,
  Doctor,
  Invoice,
  LabRequest,
  Patient,
  Prescription,
  Role,
  StaffMember,
  Toast,
  User,
  Visit,
  VisitStatus,
  Ward,
} from "./types";
import {
  appointments as seedAppointments,
  demoUsers,
  doctors as seedDoctors,
  invoices as seedInvoices,
  labRequests as seedLabs,
  patients as seedPatients,
  prescriptions as seedPrescriptions,
  staff as seedStaff,
  visits as seedVisits,
  wards as seedWards,
} from "./seed";
import { addDays, todayISO } from "./utils";

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

interface State {
  /** anchor for the daily seed-date rebase (see rebaseSeedDates) */
  seededOn: string;
  users: User[];
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  prescriptions: Prescription[];
  visits: Visit[];
  invoices: Invoice[];
  labs: LabRequest[];
  wards: Ward[];
  staff: StaffMember[];
  session: User | null;
  theme: "light" | "dark";
  toasts: Toast[];

  // auth
  loginAsRole: (role: Role) => void;
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

  // staff
  toggleOnCall: (staffId: string) => void;
}

const docBaseFee: Record<string, number> = {
  Cardiology: 180,
  Pediatrics: 150,
  Dermatology: 160,
  Orthopedics: 190,
  Neurology: 175,
  "General Medicine": 150,
};

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed data is generated relative to "today" at runtime, then persisted to
 * localStorage. Without this, "today's queue" freezes on the date the store
 * was first created and drifts into the past every midnight. On each
 * hydration we shift every relative date forward by however many days have
 * passed since the store was seeded, keeping today/history/upcoming aligned
 * with the real calendar while preserving any user-made changes.
 */
function rebaseSeedDates(persisted: unknown, today: string): Record<string, unknown> | null {
  if (!persisted || typeof persisted !== "object") return null;
  const p = persisted as Record<string, unknown>;
  const seededOn = typeof p.seededOn === "string" ? p.seededOn : null;
  if (!seededOn || seededOn === today) return p;

  const delta = Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(seededOn + "T00:00:00").getTime()) / 86_400_000
  );
  if (delta === 0) return p;

  const shift = (iso: string) => addDays(iso, delta);
  const shiftOpt = (iso?: string) => (typeof iso === "string" ? addDays(iso, delta) : iso);
  const mapAll = <X,>(arr: unknown, fn: (x: X) => X) =>
    Array.isArray(arr) ? (arr as X[]).map(fn) : (arr as X[]);

  return {
    ...p,
    seededOn: today,
    appointments: mapAll<Appointment>(p.appointments, (a) => ({ ...a, date: shift(a.date) })),
    invoices: mapAll<Invoice>(p.invoices, (i) => ({ ...i, date: shift(i.date), dueDate: shift(i.dueDate), paidAt: shiftOpt(i.paidAt) })),
    prescriptions: mapAll<Prescription>(p.prescriptions, (r) => ({ ...r, date: shift(r.date) })),
    visits: mapAll<Visit>(p.visits, (v) => ({ ...v, date: shift(v.date) })),
    labs: mapAll<LabRequest>(p.labs, (l) => ({ ...l, requestedOn: shift(l.requestedOn) })),
    wards: mapAll<Ward>(p.wards, (w) => ({
      ...w,
      rooms: w.rooms.map((r) => ({
        ...r,
        beds: r.beds.map((b) => ({ ...b, since: shiftOpt(b.since) })),
      })),
    })),
    patients: mapAll<Patient>(p.patients, (pt) => ({
      ...pt,
      immunizations: pt.immunizations.map((im) => ({ ...im, date: shift(im.date) })),
    })),
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      seededOn: todayISO(),
      users: demoUsers,
      doctors: seedDoctors,
      patients: seedPatients,
      appointments: seedAppointments,
      prescriptions: seedPrescriptions,
      visits: seedVisits,
      invoices: seedInvoices,
      labs: seedLabs,
      wards: seedWards,
      staff: seedStaff,
      session: null,
      theme: "light",
      toasts: [],

      loginAsRole: (role) => {
        const user = demoUsers.find((u) => u.role === role) ?? demoUsers[0];
        set({ session: user });
      },
      logout: () => set({ session: null }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

      toast: (t) => {
        const id = nanoid(6);
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

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

        // auto-generate the consultation invoice
        const fee = docBaseFee[doctor?.department ?? ""] ?? 150;
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

      toggleOnCall: (staffId) => {
        set((s) => ({
          staff: s.staff.map((m) => (m.id === staffId ? { ...m, onCall: !m.onCall } : m)),
          doctors: s.doctors.map((d) =>
            d.id === staffId ? { ...d, onCall: !d.onCall } : d
          ),
        }));
      },
    }),
    {
      name: "carepulse-v1",
      version: 1,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage)
      ),
      migrate: (persisted) => persisted as State,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        // Legacy (pre-anchor) store: keep only session/theme, re-seed the rest
        // so relative dates are guaranteed correct.
        if (typeof p.seededOn !== "string") {
          return {
            ...current,
            session: (p.session as State["session"]) ?? current.session,
            theme: (p.theme as State["theme"]) ?? current.theme,
          };
        }
        const rebased = rebaseSeedDates(p, todayISO());
        return { ...current, ...(rebased ?? {}) };
      },
      partialize: (s) => ({
        seededOn: s.seededOn,
        doctors: s.doctors,
        patients: s.patients,
        appointments: s.appointments,
        prescriptions: s.prescriptions,
        visits: s.visits,
        invoices: s.invoices,
        labs: s.labs,
        wards: s.wards,
        staff: s.staff,
        session: s.session,
        theme: s.theme,
      }),
    }
  )
);

/** selector helpers */
export const useSession = () => useStore((s) => s.session);
export const useToast = () => useStore((s) => s.toast);
